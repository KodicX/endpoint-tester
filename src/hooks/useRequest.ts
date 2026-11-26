import { useEffect, useRef, useState } from 'react';
import {
  type AuthConfig,
  type HistoryEntry,
  type HttpMethod,
  type RequestResponse,
  generateId,
  getStatusLabel,
} from '../utils/storage';
import { stringifyParamsToUrl, substitutePathParams } from '../utils/url';

const BODY_METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];
const REQUEST_TIMEOUT_MS = 30_000;

function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function isJsonContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes('application/json') || normalized.includes('+json');
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function formatNetworkError(
  err: unknown,
  targetUrl: string,
  didTimeout: boolean,
): string {
  if (didTimeout) {
    return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The server did not respond in time or may be unreachable.`;
  }

  const baseMessage =
    err instanceof Error ? err.message : 'Unknown error occurred';

  const isFetchNetworkFailure =
    err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(baseMessage);

  if (!isFetchNetworkFailure) {
    return baseMessage;
  }

  try {
    const parsed = new URL(targetUrl);
    const isPageHttps =
      typeof window !== 'undefined' && window.location.protocol === 'https:';

    if (isLocalOrPrivateHost(parsed.hostname)) {
      const hints = [
        '- Verify the local server is running on that port.',
        '- Enable CORS on your local server (Access-Control-Allow-Origin).',
      ];
      if (isPageHttps) {
        hints.push(
          '- From HTTPS, Chrome Private Network Access requires "Access-Control-Allow-Private-Network: true" on OPTIONS preflight.',
          '- Browsers block insecure HTTP calls to LAN IPs (Mixed Content). For unrestricted localhost testing, run this app locally with "pnpm dev".',
        );
      }
      return `${baseMessage} (local/private network target: ${parsed.host})\n\nPossible causes:\n${hints.join('\n')}`;
    }

    if (isPageHttps && parsed.protocol === 'http:') {
      return `${baseMessage} (Mixed Content blocked)\n\nThis page is served over HTTPS, so the browser blocked an insecure HTTP request to ${parsed.origin}. Use https:// if the API supports it.`;
    }

    return `${baseMessage}\n\nPossible causes:\n- CORS policy on ${parsed.origin} blocked this browser request (missing Access-Control-Allow-Origin or preflight headers).\n- The server is offline, DNS failed, or the SSL certificate is invalid.`;
  } catch {
    return baseMessage;
  }
}

export function useRequest() {
  const [response, setResponse] = useState<RequestResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function parseResponseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  async function parseResponseBody(
    res: Response,
  ): Promise<{ data: unknown; rawText: string }> {
    const rawText = await res.text();
    const contentType = res.headers.get('content-type') ?? '';

    if (rawText.trim() !== '' && isJsonContentType(contentType)) {
      try {
        return { data: JSON.parse(rawText), rawText };
      } catch {
        return { data: rawText, rawText };
      }
    }

    return { data: rawText, rawText };
  }

  function calculateSize(headers: Headers, rawText: string): number {
    const contentLength = headers.get('content-length');
    if (contentLength) {
      const parsed = parseInt(contentLength, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }

    if (!rawText) return 0;
    return new Blob([rawText]).size;
  }

  function applyAuth(
    auth: AuthConfig | undefined,
    headers: Record<string, string>,
    params: { key: string; value: string }[],
  ): { headers: Record<string, string>; params: { key: string; value: string }[] } {
    if (!auth || auth.type === 'no-auth') return { headers, params };

    const newHeaders = { ...headers };
    const newParams = [...params];

    if (auth.type === 'bearer' && auth.bearer?.token) {
      newHeaders['Authorization'] = `Bearer ${auth.bearer.token}`;
    } else if (auth.type === 'jwt' && auth.jwt?.token) {
      newHeaders['Authorization'] = `Bearer ${auth.jwt.token}`;
    } else if (auth.type === 'oauth2' && auth.oauth2?.accessToken) {
      newHeaders['Authorization'] = `Bearer ${auth.oauth2.accessToken}`;
    } else if (auth.type === 'basic' && auth.basic) {
      const encoded = encodeBase64Utf8(
        `${auth.basic.username}:${auth.basic.password}`,
      );
      newHeaders['Authorization'] = `Basic ${encoded}`;
    } else if (auth.type === 'api-key' && auth.apiKey) {
      const key = auth.apiKey.key.trim();
      if (key !== '') {
        if (auth.apiKey.addTo === 'headers') {
          newHeaders[key] = auth.apiKey.value;
        } else {
          newParams.push({ key, value: auth.apiKey.value });
        }
      }
    }

    return { headers: newHeaders, params: newParams };
  }

  function buildHeaders(
    headers: { key: string; value: string }[],
  ): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach(({ key, value }) => {
      if (key.trim() !== '') {
        result[key.trim()] = value.trim();
      }
    });
    return result;
  }

  function logToHistory(
    addEntry: (entry: HistoryEntry) => void,
    tabId: string,
    method: HttpMethod,
    url: string,
    params: { key: string; value: string }[],
    pathParams: { key: string; value: string }[],
    headers: { key: string; value: string }[],
    body: string,
    responseStatus: number,
    responseTime: number,
    auth?: AuthConfig,
  ): void {
    const newEntry: HistoryEntry = {
      id: generateId(),
      tabId,
      timestamp: new Date().toISOString(),
      method,
      url,
      params,
      pathParams,
      headers,
      body,
      auth,
      responseStatus,
      responseTime,
    };
    addEntry(newEntry);
  }

  async function executeRequest(
    tabId: string,
    method: HttpMethod,
    url: string,
    params: { key: string; value: string }[],
    pathParams: { key: string; value: string }[],
    headers: { key: string; value: string }[],
    body: string,
    addEntry: (entry: HistoryEntry) => void,
    auth?: AuthConfig,
  ): Promise<RequestResponse | null> {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setIsLoading(true);
    setError(null);
    setResponse(null);

    const startTime = performance.now();
    let finalResponse: RequestResponse | null = null;
    let finalUrl = url.trim();

    try {
      let finalHeaders = buildHeaders(headers);
      let finalParams = [...params];

      const authResult = applyAuth(auth, finalHeaders, finalParams);
      finalHeaders = authResult.headers;
      finalParams = authResult.params;

      finalUrl = stringifyParamsToUrl(url.trim(), finalParams);
      finalUrl = substitutePathParams(finalUrl, pathParams);

      const hasBody = BODY_METHODS.includes(method) && body.trim() !== '';
      const hasContentType = Object.keys(finalHeaders).some(
        (key) => key.toLowerCase() === 'content-type',
      );
      if (hasBody && !hasContentType && isValidJson(body)) {
        finalHeaders['Content-Type'] = 'application/json';
      }

      const options: RequestInit = {
        method,
        headers: finalHeaders,
        signal: controller.signal,
      };
      if (hasBody) {
        options.body = body;
      }

      const res = await fetch(finalUrl, options);
      const responseTime = performance.now() - startTime;
      const { data: responseData, rawText } = await parseResponseBody(res);
      const parsedHeaders = parseResponseHeaders(res.headers);
      const size = calculateSize(res.headers, rawText);

      finalResponse = {
        status: res.status,
        statusText: res.statusText || getStatusLabel(res.status),
        responseTime,
        data: responseData,
        headers: parsedHeaders,
        isError: false,
        size,
      };

      setResponse(finalResponse);

      logToHistory(
        addEntry,
        tabId,
        method,
        url,
        params,
        pathParams,
        headers,
        body,
        res.status,
        responseTime,
        auth,
      );
    } catch (err) {
      if (controller.signal.aborted && !didTimeout) {
        return null;
      }

      const responseTime = performance.now() - startTime;
      const errorMessage = formatNetworkError(err, finalUrl, didTimeout);

      setError(errorMessage);
      finalResponse = {
        status: 0,
        statusText: didTimeout ? 'Request Timeout' : 'Network Error',
        responseTime,
        data: null,
        headers: {},
        isError: true,
        errorMessage,
        size: 0,
      };

      setResponse(finalResponse);

      logToHistory(
        addEntry,
        tabId,
        method,
        url,
        params,
        pathParams,
        headers,
        body,
        0,
        responseTime,
        auth,
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
    return finalResponse;
  }

  function cancelRequest(): void {
    abortControllerRef.current?.abort();
  }

  function clearResponse(): void {
    setResponse(null);
    setError(null);
  }

  return {
    response,
    setResponse,
    isLoading,
    error,
    executeRequest,
    cancelRequest,
    clearResponse,
  };
}
