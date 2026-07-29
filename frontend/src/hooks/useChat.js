import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, createStream } from '@/lib/api-client';

// Types for streaming events
export const STREAM_EVENTS = {
  CONNECTED: 'connected',
  TEXT: 'text',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  UI_PAYLOAD: 'ui_payload',
  UI_ACTION: 'ui_action',
  DONE: 'done',
  ERROR: 'error',
};

// Message types
export const MESSAGE_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
};

// UIPayload types from backend
export const UI_TYPES = {
  REPLACE_CATALOG: 'replace_catalog',
  SHOW_PRODUCT: 'show_product',
  SUGGEST_TRY_ON: 'suggest_try_on',
  TRY_ON_STARTED: 'try_on_started',
  TRY_ON_COMPLETED: 'try_on_completed',
  CONFIRM_PURCHASE: 'confirm_purchase',
  PAYMENT_PENDING: 'payment_pending',
  ORDER_CONFIRMED: 'order_confirmed',
  CART_UPDATED: 'cart_updated',
  ADD_TO_CART: 'add_to_cart',
  ERROR: 'error',
};

/**
 * Hook for streaming chat with the AI agent
 */
export function useChatStream() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [currentReply, setCurrentReply] = useState('');
  const [products, setProducts] = useState([]);
  const [actions, setActions] = useState([]);
  const abortControllerRef = useRef(null);
  const assistantContentRef = useRef('');
  const assistantMessageIdRef = useRef(null);

  const getSession = useCallback(() => {
    const stored = localStorage.getItem('somela_session');
    return stored ? JSON.parse(stored) : null;
  }, []);

  const handleUIPayload = useCallback((payload) => {
    if (!payload || !payload.type) return;

    switch (payload.type) {
      case UI_TYPES.REPLACE_CATALOG:
        if (payload.products) {
          setProducts(payload.products);
        }
        break;

      case UI_TYPES.SHOW_PRODUCT:
        if (payload.product) {
          setProducts([payload.product]);
        }
        break;

      case UI_TYPES.SUGGEST_TRY_ON:
        if (payload.product) {
          // Store try-on suggestion for UI to show button
          setActions((prev) => [...prev, {
            type: 'try_on_suggestion',
            product: payload.product,
            reason: payload.reason,
          }]);
        }
        break;

      case UI_TYPES.CONFIRM_PURCHASE:
        // Handle purchase confirmation UI
        break;

      case UI_TYPES.CART_UPDATED:
        // Store cart info for UI
        if (payload.cart) {
          setActions((prev) => [...prev, {
            type: 'cart_updated',
            cart: payload.cart,
            message: payload.message,
          }]);
        }
        break;

      case UI_TYPES.ADD_TO_CART:
        // Store add-to-cart confirmation
        if (payload.product) {
          setActions((prev) => [...prev, {
            type: 'added_to_cart',
            product: payload.product,
          }]);
        }
        break;

      default:
        break;
    }
  }, []);

  const updateAssistantMessage = useCallback((content) => {
    assistantContentRef.current = content;
    setCurrentReply(content);
    
    setMessages((prev) => {
      const id = assistantMessageIdRef.current;
      const existing = prev.find((m) => m.id === id);
      if (existing) {
        return prev.map((m) =>
          m.id === id ? { ...m, content } : m
        );
      } else {
        // Create the message if it doesn't exist
        const newMsg = {
          id: id || `assistant-${Date.now()}`,
          role: MESSAGE_TYPES.ASSISTANT,
          content,
        };
        if (id) assistantMessageIdRef.current = newMsg.id;
        return [...prev, newMsg];
      }
    });
  }, []);

  const sendMessage = useCallback(async (message, imageUrl = null) => {
    const session = getSession();
    if (!session) {
      setError('No session available');
      return;
    }

    // Add user message to state
    const userMessage = {
      id: `user-${Date.now()}`,
      role: MESSAGE_TYPES.USER,
      content: message,
      imageUrl,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setError(null);
    setCurrentReply('');
    setProducts([]);
    setActions([]);
    assistantContentRef.current = '';

    // Create assistant message ID for this turn
    const assistantMessageId = `assistant-${Date.now()}`;
    assistantMessageIdRef.current = assistantMessageId;

    try {
      await createStream(
        '/chat/stream',
        {
          sessionId: session.sessionId,
          userId: session.userId,
          message: message,
          imageUrl: imageUrl,
        },
        // onMessage
        (eventType, data) => {
          switch (eventType) {
            case STREAM_EVENTS.TEXT:
              updateAssistantMessage(assistantContentRef.current + data);
              break;

            case STREAM_EVENTS.UI_PAYLOAD:
              handleUIPayload(data);
              break;

            case STREAM_EVENTS.UI_ACTION:
              setActions((prev) => [...prev, data]);
              break;

            case STREAM_EVENTS.ERROR:
              setError(data.message || 'An error occurred');
              break;

            case STREAM_EVENTS.DONE:
              // Finalize the response with the full reply
              updateAssistantMessage(data.reply || assistantContentRef.current);
              // Also get products from uiPayload if present
              if (data.uiPayload) {
                handleUIPayload(data.uiPayload);
              }
              break;
          }
        },
        // onError
        (err) => {
          console.error('Stream error:', err);
          setError(err.message || 'Connection error');
          setIsStreaming(false);
        },
        // onComplete
        () => {
          setIsStreaming(false);
        }
      );
    } catch (err) {
      console.error('Send message error:', err);
      setError(err.message || 'Failed to send message');
      setIsStreaming(false);
    }
  }, [getSession, handleUIPayload, updateAssistantMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentReply('');
    setProducts([]);
    setActions([]);
    setError(null);
    assistantContentRef.current = '';
    assistantMessageIdRef.current = null;
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  return {
    messages,
    isStreaming,
    error,
    currentReply,
    products,
    actions,
    sendMessage,
    clearMessages,
    abort,
  };
}

/**
 * Hook for fetching chat history
 */
export function useChatHistory() {
  const getSession = useCallback(() => {
    const stored = localStorage.getItem('somela_session');
    return stored ? JSON.parse(stored) : null;
  }, []);

  return useQuery({
    queryKey: ['chat', 'history'],
    queryFn: async () => {
      const session = getSession();
      if (!session) return { messages: [], preferences: null };

      const response = await apiClient.get('/chat/history', {
        headers: {
          'x-user-id': session.userId,
        },
      });
      return response;
    },
    enabled: !!getSession(),
  });
}

/**
 * Hook for visual search with image upload
 */
export function useVisualSearch() {
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  const startSearch = useCallback(async (imageUrl, text = null) => {
    try {
      const response = await apiClient.post('/visual-search', {
        imageUrl,
        text,
      });
      setTaskId(response.taskId);
      setStatus('processing');
      return response.taskId;
    } catch (err) {
      setError(err.message || 'Failed to start visual search');
      throw err;
    }
  }, []);

  const pollResults = useCallback(async () => {
    if (!taskId) return null;

    setIsPolling(true);
    try {
      const response = await apiClient.get(`/visual-search/${taskId}`);
      setStatus(response.status);
      
      if (response.status === 'completed') {
        setResults(response.results || []);
        return response.results;
      } else if (response.status === 'failed') {
        setError(response.errorMessage || 'Visual search failed');
        return null;
      }
      return null;
    } catch (err) {
      setError(err.message || 'Failed to get results');
      return null;
    } finally {
      setIsPolling(false);
    }
  }, [taskId]);

  const reset = useCallback(() => {
    setTaskId(null);
    setStatus(null);
    setResults([]);
    setError(null);
  }, []);

  return {
    taskId,
    status,
    results,
    error,
    isPolling,
    startSearch,
    pollResults,
    reset,
  };
}

export default useChatStream;
