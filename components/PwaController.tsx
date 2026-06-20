"use client";

import { useEffect, useState } from "react";

/**
 * PwaController
 *
 * - Registers the hand-authored service worker (`/sw.js`) on mount, guarded by
 *   feature detection so it is a no-op in unsupported browsers (Req 13.1).
 * - Renders a persistent offline indicator whenever the browser reports no
 *   network connectivity, tracked via `navigator.onLine` plus the `online` /
 *   `offline` events (Req 13.5).
 */
export default function PwaController() {
  // `undefined` until we've checked on the client, to avoid a hydration
  // mismatch (the server has no `navigator`).
  const [offline, setOffline] = useState<boolean | undefined>(undefined);

  // Register the service worker once on mount.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures must not break the app; offline support is
        // simply unavailable in that case.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // Track online/offline status for the persistent indicator.
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full bg-white"
      />
      Offline mode
    </div>
  );
}
