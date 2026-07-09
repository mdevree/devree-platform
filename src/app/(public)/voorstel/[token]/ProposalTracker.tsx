"use client";

import { useEffect, useRef } from "react";

type EventType = "page_open" | "heartbeat" | "visibility_hidden" | "pagehide";

function sessionIdForToken(token: string) {
  const key = `devree-proposal-session:${token}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, value);
  return value;
}

export default function ProposalTracker({ token, enabled }: { token: string; enabled: boolean }) {
  const activeSinceRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    sessionIdRef.current = sessionIdForToken(token);
    activeSinceRef.current = document.visibilityState === "visible" ? Date.now() : null;

    function activeSecondsSinceLastFlush() {
      if (activeSinceRef.current == null) return 0;
      const now = Date.now();
      const seconds = Math.max(0, Math.round((now - activeSinceRef.current) / 1000));
      activeSinceRef.current = now;
      return seconds;
    }

    function send(eventType: EventType, activeSeconds = 0, beacon = false) {
      const body = JSON.stringify({
        eventType,
        sessionId: sessionIdRef.current,
        activeSeconds,
        path: window.location.pathname,
        referrer: document.referrer || null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      });
      const url = `/api/public/otd/proposal/${encodeURIComponent(token)}/events`;

      if (beacon && "sendBeacon" in navigator) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: beacon,
      }).catch(() => {});
    }

    send("page_open");

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const seconds = activeSecondsSinceLastFlush();
      if (seconds > 0) send("heartbeat", seconds);
    }, 15000);

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        const seconds = activeSecondsSinceLastFlush();
        send("visibility_hidden", seconds, true);
        activeSinceRef.current = null;
      } else {
        activeSinceRef.current = Date.now();
      }
    }

    function onPageHide() {
      const seconds = activeSecondsSinceLastFlush();
      send("pagehide", seconds, true);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, token]);

  return null;
}
