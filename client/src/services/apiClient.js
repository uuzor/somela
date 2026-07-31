import { supabase } from '@/lib/supabase';

const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const ACTIVE_USER_STORAGE_KEY = 'opencommercelens_active_user_id';

async function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };

  try {
    const activeUserId = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    if (activeUserId && !headers['x-user-id']) {
      headers['x-user-id'] = activeUserId;
    }
  } catch {
    // Ignore storage access failures.
  }

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    // Ignore auth lookup failures.
  }

  return headers;
}

function buildUrl(path, query) {
  const url = new URL(path, DEFAULT_BASE_URL || window.location.origin);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    query,
    body,
    headers = {},
    responseType = 'json',
    signal,
  } = options;

  const requestHeaders = await getAuthHeaders(headers);
  let requestBody = body;

  if (body && !(body instanceof FormData) && !(body instanceof Blob) && typeof body === 'object') {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers: requestHeaders,
    body: requestBody,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || response.statusText);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  if (responseType === 'text') {
    return response.text();
  }

  return response.json();
}

export function authHeaders(authToken, extraHeaders = {}) {
  return authToken
    ? { ...extraHeaders, Authorization: `Bearer ${authToken}` }
    : extraHeaders;
}

export function userHeaders(userId, extraHeaders = {}) {
  return userId ? { ...extraHeaders, 'x-user-id': userId } : extraHeaders;
}

export function setActiveUserId(userId) {
  try {
    if (userId) {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, userId);
    } else {
      localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export { buildUrl, DEFAULT_BASE_URL, getAuthHeaders, ACTIVE_USER_STORAGE_KEY };
