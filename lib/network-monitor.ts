/**
 * Counts network requests made to origins other than our own, using the
 * browser's Resource Timing API. Powers the "processed on this device"
 * indicator so the privacy claim is something users can verify, not just read.
 *
 * Resource Timing covers fetch/XHR, scripts, workers, images, fonts and
 * styles. It cannot observe requests made by browser extensions.
 */
export interface ExternalRequestSummary {
  count: number;
  origins: string[];
}

export function isExternal(url: string, ownOrigin: string): boolean {
  try {
    const u = new URL(url, ownOrigin);
    if (u.protocol === "blob:" || u.protocol === "data:") return false;
    return u.origin !== ownOrigin;
  } catch {
    return false;
  }
}

export function summarizeExternal(urls: string[], ownOrigin: string): ExternalRequestSummary {
  const external = urls.filter((u) => isExternal(u, ownOrigin));
  const origins = Array.from(new Set(external.map((u) => new URL(u, ownOrigin).origin)));
  return { count: external.length, origins };
}

/** Summarize every external request made since the page loaded. */
export function getExternalRequests(): ExternalRequestSummary {
  if (typeof performance === "undefined" || typeof location === "undefined") {
    return { count: 0, origins: [] };
  }
  const urls = performance.getEntriesByType("resource").map((e) => e.name);
  return summarizeExternal(urls, location.origin);
}
