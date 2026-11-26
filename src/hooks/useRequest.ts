import { useState } from 'react';
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

export function useRequest() {
  const [response, setResponse] = useState<RequestResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
    setIsLoading(true);
    setError(null);
    setResponse(null);

    const startTime = performance.now();
    let finalResponse: RequestResponse | null = null;

    try {
      let finalHeaders = buildHeaders(headers);
      let finalParams = [...params];

      const authResult = applyAuth(auth, finalHeaders, finalParams);
      finalHeaders = authResult.headers;
      finalParams = authResult.params;

      let finalUrl = stringifyParamsToUrl(url.trim(), finalParams);
      finalUrl = substitutePathParams(finalUrl, pathParams);

      const options: RequestInit = {
        method,
        headers: finalHeaders,
      };
      if (BODY_METHODS.includes(method) && body.trim() !== '') {
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
      const responseTime = performance.now() - startTime;
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';

      setError(errorMessage);
      finalResponse = {
        status: 0,
        statusText: 'Network Error',
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
      setIsLoading(false);
    }
    return finalResponse;
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
    clearResponse,
  };
}
