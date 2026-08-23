"use client";

import { useEffect, useRef } from "react";

type EventType = "page_open" | "video_start" | "video_progress_25" | "video_progress_75" | "video_complete";

function sessionIdForToken(token: string) {
  const key = `devree-appointment-session:${token}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, value);
  return value;
}

export function sendAppointmentEvent(token: string, eventType: EventType, sessionId: string | null) {
  fetch(`/api/public/afspraak/${encodeURIComponent(token)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      sessionId,
      path: window.location.pathname,
      referrer: document.referrer || null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }),
    keepalive: true,
  }).catch(() => {});
}

export default function AppointmentTracker({ token, enabled }: { token: string; enabled: boolean }) {
  const sessionIdRef = useRef<string | null>(null);
  const progressRef = useRef({ start: false, p25: false, p75: false, complete: false });

  useEffect(() => {
    if (!enabled) return;
    sessionIdRef.current = sessionIdForToken(token);
    sendAppointmentEvent(token, "page_open", sessionIdRef.current);
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) return;
    const video = document.querySelector<HTMLVideoElement>("[data-appointment-video]");
    if (!video) return;

    function onPlay() {
      if (progressRef.current.start) return;
      progressRef.current.start = true;
      sendAppointmentEvent(token, "video_start", sessionIdRef.current);
    }

    function onTimeUpdate() {
      if (!video?.duration || !Number.isFinite(video.duration)) return;
      const ratio = video.currentTime / video.duration;
      if (ratio >= 0.25 && !progressRef.current.p25) {
        progressRef.current.p25 = true;
        sendAppointmentEvent(token, "video_progress_25", sessionIdRef.current);
      }
      if (ratio >= 0.75 && !progressRef.current.p75) {
        progressRef.current.p75 = true;
        sendAppointmentEvent(token, "video_progress_75", sessionIdRef.current);
      }
    }

    function onEnded() {
      if (progressRef.current.complete) return;
      progressRef.current.complete = true;
      sendAppointmentEvent(token, "video_complete", sessionIdRef.current);
    }

    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [enabled, token]);

  return null;
}
