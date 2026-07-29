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
    const storedSession = localStorage.getItem('somela_session');
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
      localStorage.removeItem('somela_session');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// Helper for SSE streaming
export const createStream = async (url, body, onMessage, onError, onComplete) => {
  const storedSession = localStorage.getItem('somela_session');
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();
          continue;
        }
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              onMessage(eventType, parsed);
            } catch (e) {
              // Skip invalid JSON
            }
          }
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
  get: (url, config) => client.get(url, config),
  post: (url, data, config) => client.post(url, data, config),
  put: (url, data, config) => client.put(url, data, config),
  delete: (url, config) => client.delete(url, config),
  patch: (url, data, config) => client.patch(url, data, config),
};

export default apiClient;
