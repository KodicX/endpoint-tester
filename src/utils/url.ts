export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseParamsFromUrl(url: string): { key: string; value: string }[] {
  try {
    const [withoutHash] = url.split('#');
    const queryIndex = withoutHash.indexOf('?');
    if (queryIndex === -1) return [];

    const searchPart = withoutHash.slice(queryIndex + 1);
    if (!searchPart) return [];

    const searchParams = new URLSearchParams(searchPart);
    const params: { key: string; value: string }[] = [];

    searchParams.forEach((value, key) => {
      params.push({ key, value });
    });

    return params;
  } catch {
    return [];
  }
}

export function parsePathParamsFromUrl(
  url: string,
  currentPathParams: { key: string; value: string }[],
): { key: string; value: string }[] {
  try {
    const [withoutHash] = url.split('#');
    const [baseUrl] = withoutHash.split('?');
    const segments = baseUrl.split('/');
    const detectedKeys: string[] = [];

    segments.forEach((segment, index) => {
      // Skip protocol/host segments (e.g., "http:", "", "localhost:3000")
      if (index < 3 && baseUrl.includes('://')) return;
      if (segment.startsWith(':') && segment.length > 1) {
        const key = segment.substring(1);
        detectedKeys.push(key);
      }
    });

    // Deduplicate keys
    const uniqueKeys = Array.from(new Set(detectedKeys));

    // Preserve existing values for keys that are still present
    return uniqueKeys.map((key) => {
      const existing = (currentPathParams || []).find((p) => p.key === key);
      return existing ? existing : { key, value: '' };
    });
  } catch {
    return [];
  }
}

export function stringifyParamsToUrl(
  baseUrl: string,
  params: { key: string; value: string }[],
): string {
  try {
    const hashIndex = baseUrl.indexOf('#');
    const hashPart = hashIndex !== -1 ? baseUrl.slice(hashIndex) : '';
    const withoutHash = hashIndex !== -1 ? baseUrl.slice(0, hashIndex) : baseUrl;
    const [base] = withoutHash.split('?');
    const searchParams = new URLSearchParams();

    params.forEach(({ key, value }) => {
      if (key.trim() !== '') {
        searchParams.append(key.trim(), value.trim());
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${base}?${queryString}${hashPart}` : `${base}${hashPart}`;
  } catch {
    return baseUrl;
  }
}

/**
 * Substitutes path parameters (e.g., :id) with their values for the actual request.
 */
export function substitutePathParams(
  url: string,
  pathParams: { key: string; value: string }[],
): string {
  let substitutedUrl = url;

  pathParams.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (trimmedKey !== '') {
      const escapedKey = escapeRegExp(trimmedKey);
      const regex = new RegExp(`:${escapedKey}(?=/|\\?|#|$)`, 'g');
      const trimmedValue = value.trim();
      const replacement = trimmedValue
        ? encodeURIComponent(trimmedValue)
        : `:${trimmedKey}`;
      substitutedUrl = substitutedUrl.replace(regex, replacement);
    }
  });

  return substitutedUrl;
}
