import axios from 'axios';

const SERVER_ERROR_EVENT = 'iotproxy:server-error';
const SERVER_RECOVERED_EVENT = 'iotproxy:server-recovered';
export const FORCE_LOGOUT_EVENT = 'iotproxy:force-logout';

// Debounce timer — only emit server error if the failure persists for >3 s.
// This prevents transient errors from triggering the full-page error state and
// the deadlock where unmounted components can no longer trigger recovery.
let serverErrorTimer: ReturnType<typeof setTimeout> | null = null;

function emitServerError(status?: number, message?: string) {
  if (typeof window === 'undefined') return;
  if (serverErrorTimer !== null) return; // already pending, don't stack timers
  serverErrorTimer = setTimeout(() => {
    serverErrorTimer = null;
    window.dispatchEvent(
      new CustomEvent(SERVER_ERROR_EVENT, { detail: { status, message } }),
    );
  }, 3500);
}

function emitServerRecovered() {
  if (typeof window === 'undefined') return;
  if (serverErrorTimer !== null) {
    clearTimeout(serverErrorTimer); // cancel pending error — transient failure
    serverErrorTimer = null;
    return; // server recovered before the timer fired, no-op
  }
  window.dispatchEvent(new Event(SERVER_RECOVERED_EVENT));
}

function forceLogout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('orgs');
  window.dispatchEvent(new Event(FORCE_LOGOUT_EVENT));
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000, // 15 s — prevents hanging requests keeping isLoading: true forever
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single shared promise so concurrent 401s all wait for the same refresh call
// instead of each firing their own — which would exhaust a single-use refresh token.
let refreshingPromise: Promise<string> | null = null;

function doRefresh(): Promise<string> {
  if (refreshingPromise) return refreshingPromise;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    forceLogout();
    return Promise.reject(new Error('No refresh token'));
  }

  refreshingPromise = axios
    .post('/api/v1/auth/refresh', { refreshToken })
    .then(({ data }) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return data.accessToken as string;
    })
    .catch((e) => {
      forceLogout();
      throw e;
    })
    .finally(() => {
      refreshingPromise = null;
    });

  return refreshingPromise;
}

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => {
    emitServerRecovered();
    return res;
  },
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        const newToken = await doRefresh();
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api(err.config);
      } catch {
        return Promise.reject(err);
      }
    }

    // Retry already attempted but still 401 — force logout
    if (err.response?.status === 401 && err.config._retry) {
      forceLogout();
      return Promise.reject(err);
    }

    const status = err.response?.status as number | undefined;
    if (!status || status >= 500) {
      emitServerError(status, err.message);
    }

    return Promise.reject(err);
  },
);
