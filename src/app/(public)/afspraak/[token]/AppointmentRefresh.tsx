"use client";
import { useEffect } from "react";
export default function AppointmentRefresh({ end, enabled }: { end: string | null; enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !end) return;
    const at = Date.parse(end);
    if (!Number.isFinite(at)) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (Date.now() > at) window.location.reload();
      else timer = setTimeout(check, Math.min(at - Date.now() + 1000, 2_147_000_000));
    };
    check();
    const visible = () => { if (document.visibilityState === "visible" && Date.now() > at) window.location.reload(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [enabled, end]);
  return null;
}
