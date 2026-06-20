/*
 * PDFy service worker (hand-authored, no build tooling).
 *
 * Strategy:
 *  - install:  precache the app shell so the app boots offline (Req 13.1, 13.2).
 *  - activate: delete caches from previous versions, then claim clients so the
 *              updated worker controls open pages immediately (Req 13.6).
 *  - fetch:    cache-first for GET requests, falling back to the network and
 *              caching new successful responses so tool chunks get cached on
 *              first use (Req 13.3). Navigation requests that miss the cache
 *              while offline get a friendly offline fallback page (Req 13.4).
 *
 * To ship updated assets, bump CACHE_VERSION. The new worker precaches the new
 * shell, skipWaiting + clients.claim activate it, and old caches are purged, so
 * the updated assets are served on the next load (Req 13.6).
 *
 * This file lives in public/ and is emitted verbatim by the Next.js static
 * export, so it works with no server-side runtime (Req 13.7).
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `pdfy-shell-${CACHE_VERSION}`;

// Core app-shell URLs to precache. Keep this list small and resilient: if any
// single entry fails to fetch we still install (cache.addAll is all-or-nothing,
// so we add individually and ignore per-URL failures).
const APP_SHELL = ["/", "/tools", "/manifest.webmanifest"];

// Friendly HTML shown for navigation requests that are not cached while offline.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#009966" />
  <title>Offline - PDFy</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #ffffff; color: #1f2937; padding: 24px; text-align: center;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0a; color: #e5e7eb; }
    }
    .card { max-width: 28rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #009966; }
    p { line-height: 1.6; margin: 0.5rem 0; }
    button {
      margin-top: 1rem; padding: 0.625rem 1.25rem; border: none; border-radius: 0.5rem;
      background: #009966; color: #fff; font-size: 1rem; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>You're offline</h1>
    <p>This feature isn't available offline yet. Open it once while connected and it will be cached for offline use.</p>
    <p>Tools you've already opened still work without a connection.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (err) {
            // Ignore individual precache failures so install still succeeds.
          }
        })
      );
      // Activate this worker as soon as it finishes installing (Req 13.6).
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches that belong to previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("pdfy-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      // Take control of already-open pages so updates apply immediately.
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate activation of a waiting worker.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle same-origin GET requests; let everything else hit the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const cache = await caches.open(CACHE_NAME);

  // Cache-first: serve a cached copy when we have one.
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    // Cache successful, basic (same-origin) GET responses so tool chunks and
    // other assets get cached on first use (Req 13.3).
    if (response && response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed (offline). For navigations, show the offline fallback so
    // the app doesn't crash and the user sees a clear message (Req 13.4).
    if (request.mode === "navigate") {
      return new Response(OFFLINE_FALLBACK_HTML, {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    // Non-navigation request with no cache entry: surface a 503 so callers can
    // handle the unavailable asset gracefully.
    return new Response("Offline: resource not available in cache.", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
