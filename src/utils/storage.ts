export type HttpMethod = 
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'PATCH'
    | 'ERROR';

export type StatusCategories =
  | 'success'
  | 'redirect'
  | 'client-error'
  | 'server-error'
  | 'network-error';

export type AuthMethod =
  | 'no-auth'
  | 'api-key'
  | 'bearer'
  | 'basic'
  | 'oauth2'
  | 'jwt'

export type AuthConfig = {
  type: AuthMethod,
  apiKey?: { key: string; value: string; addTo: 'headers' | 'params' }
  bearer?: { token: string }
  basic?: { username: string; password: string }
  oauth2?: { accessToken: string }
  jwt?: { token: string }
}

export const STATUS_LABELS: Record<number, string> = {
  200: 'OK',
  201: 'CREATED',
  202: 'ACCEPTED',
  204: 'NO CONTENT',
  301: 'MOVED PERMANENTLY',
  302: 'FOUND',
  304: 'NOT MODIFIED',
  400: 'BAD REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT FOUND',
  405: 'METHOD NOT ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE ENTITY',
  429: 'TOO MANY REQUESTS',
  500: 'INTERNAL SERVER ERROR',
  502: 'BAD GATEWAY',
  503: 'SERVICE UNAVAILABLE',
  504: 'GATEWAY TIMEOUT',
};

export type RequestResponse = {
  status: number;
  statusText: string;
  responseTime: number;
  data: unknown;
  headers: Record<string, string>;
  isError: boolean;
  errorMessage?: string;
  size?: number; // Response size in bytes
};

export type Tab = {
  id: string;
  label: string;
  method: HttpMethod;
  url: string;
  params: { key: string; value: string }[];
  pathParams: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  body: string;
  response?: RequestResponse | null;
  savedId?: string; // Tracks if this tab is linked to a SavedEndpoint
  auth?: AuthConfig;
};

export type HistoryEntry = {
  id: string;
  tabId: string;
  timestamp: string;
  method: HttpMethod;
  url: string;
  params: { key: string; value: string }[];
  pathParams: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  body: string;
  auth?: AuthConfig;
  responseStatus: number;
  responseTime: number;
};

export type SavedEndpoint = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: { key: string; value: string }[];
  pathParams: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  body: string;
  auth?: AuthConfig;
};

const TABS_KEY = 'daro_tabs';
const HISTORY_KEY = 'daro_history';
const SAVED_KEY = 'daro_saved_endpoints';
const MAX_HISTORY = 100;
const STORAGE_AVAILABLE = isStorageAvailable();

export function generateId(): string {
  return crypto.randomUUID();
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('Failed to parse localStorage data, falling back to default', error);
    return fallback;
  }
}

export function getTabs(): Tab[] {
  if (!STORAGE_AVAILABLE) return [];
  const parsed = safeParseJson<unknown>(localStorage.getItem(TABS_KEY), []);
  return Array.isArray(parsed) ? (parsed as Tab[]) : [];
}

export function saveTabs(tabs: Tab[]): void {
  if (!STORAGE_AVAILABLE) return;
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch (error) {
    console.warn(
      'localStorage quota exceeded while saving tabs, retrying without cached responses',
      error,
    );
    try {
      const strippedTabs = tabs.map((tab) => ({ ...tab, response: null }));
      localStorage.setItem(TABS_KEY, JSON.stringify(strippedTabs));
    } catch (retryError) {
      console.warn('Unable to persist tabs to localStorage', retryError);
    }
  }
}

export function getHistory(): HistoryEntry[] {
  if (!STORAGE_AVAILABLE) return [];
  const parsed = safeParseJson<unknown>(localStorage.getItem(HISTORY_KEY), []);
  return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
}

export function getSavedEndpoints(): SavedEndpoint[] {
  if (!STORAGE_AVAILABLE) return [];
  const parsed = safeParseJson<unknown>(localStorage.getItem(SAVED_KEY), []);
  return Array.isArray(parsed) ? (parsed as SavedEndpoint[]) : [];
}

export function saveEndpoints(endpoints: SavedEndpoint[]): void {
  if (!STORAGE_AVAILABLE) return;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(endpoints));
  } catch (error) {
    console.warn('Unable to persist saved endpoints to localStorage', error);
  }
}

function pruneHistory(entries: HistoryEntry[]): HistoryEntry[] {
  if (entries.length <= MAX_HISTORY) return entries;
  return entries.slice(0, MAX_HISTORY);
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (!STORAGE_AVAILABLE) return;
  try {
    const pruned = pruneHistory(entries);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
  } catch (error) {
    console.warn(
      'localStorage is full, trimming history to free up space',
      error,
    );
    try {
      const trimmed = entries.slice(0, Math.min(20, MAX_HISTORY));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (retryError) {
      console.warn('Unable to persist history to localStorage', retryError);
    }
  }
}

export function getStatusLabel(status: number): string {
  return STATUS_LABELS[status] || status.toString();
}

export function getMethodColor(method: HttpMethod): string {
  const color: Record<HttpMethod, string> = {
    GET: '#4CAF50',
    POST: '#2196F3',
    PUT: '#FFC107',
    DELETE: '#F44336',
    PATCH: '#9C27B0',
    ERROR: '#000000',
  };
  return color[method] ?? '#8b8b8b';
}

export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
