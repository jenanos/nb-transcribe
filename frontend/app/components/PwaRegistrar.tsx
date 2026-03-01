"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]";

    if (window.location.protocol !== "https:" && !isLocalhost) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort registration for installability.
    });
  }, []);

  return null;
}
