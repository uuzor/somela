import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with default config
const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add session token
client.interceptors.request.use(
  (config) => {
    const storedSession = localStorage.getItem('opencommercelens_session');
    if (storedSession) {
      const { sessionToken } = JSON.parse(storedSession);
      config.headers['x-session-token'] = sessionToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Session expired - clear and reinitialize
      localStorage.removeItem('opencommercelens_session');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// Helper for SSE streaming
export const createStream = async (url, body, onMessage, onError, onComplete) => {
  const storedSession = localStorage.getItem('opencommercelens_session');
  const sessionToken = storedSession ? JSON.parse(storedSession).sessionToken : null;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (sessionToken) {
    headers['x-session-token'] = sessionToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let eventType = 'message';
    let dataBuffer = [];

    const flushEvent = () => {
      if (!dataBuffer.length) {
        eventType = 'message';
        return;
      }

      const rawData = dataBuffer.join('\n').trim();
      dataBuffer = [];
      const currentEventType = eventType;
      eventType = 'message';

      if (!rawData) return;

      try {
        const parsed = JSON.parse(rawData);
        onMessage(currentEventType, parsed);
      } catch (e) {
        onMessage(currentEventType, rawData);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        flushEvent();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line === '' || line === '\r') {
          flushEvent();
          continue;
        }

        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith('data: ')) {
          dataBuffer.push(line.slice(6));
        }
      }
    }

    onComplete?.();
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
};

// API methods
export const apiClient = {
  get: async (url, config) => (await client.get(url, config)).data,
  post: async (url, data, config) => (await client.post(url, data, config)).data,
  put: async (url, data, config) => (await client.put(url, data, config)).data,
  delete: async (url, config) => (await client.delete(url, config)).data,
  patch: async (url, data, config) => (await client.patch(url, data, config)).data,
};

export default apiClient;






