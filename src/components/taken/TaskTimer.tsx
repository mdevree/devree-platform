"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

interface TaskTimerProps {
  taskId: string;
  compact?: boolean; // true = kleine versie voor op de kaart
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}u ${m.toString().padStart(2, "0")}m`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function TaskTimer({ taskId, compact = false }: TaskTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0); // opgeslagen seconden
  const [currentSession, setCurrentSession] = useState(0); // lopende sessie seconden
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/taken/${taskId}/timer`);
      const data = await res.json();
      setIsRunning(data.isRunning);
      setTotalTimeSpent(data.totalTimeSpent);
      setCurrentSession(data.currentSessionSeconds);
    } catch {
      // stil falen
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Start tick wanneer timer loopt
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setCurrentSession((s) => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleAction(action: "start" | "pause" | "stop") {
    setActing(true);
    try {
      const res = await fetch(`/api/taken/${taskId}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        if (action === "start") {
          setIsRunning(true);
          setCurrentSession(0);
        } else {
          setIsRunning(false);
          setTotalTimeSpent(data.totalTimeSpent);
          setCurrentSession(0);
        }
      }
    } catch {
      // stil falen
    } finally {
      setActing(false);
    }
  }

  const totalSeconds = totalTimeSpent + currentSession;

  if (loading) {
    return (
      <span className="text-[10px] text-gray-400">
        {compact ? "…" : "Timer laden..."}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {totalSeconds > 0 && (
          <span className={`text-[10px] tabular-nums ${isRunning ? "font-semibold text-blue-600" : "text-gray-400"}`}>
            {formatDuration(totalSeconds)}
          </span>
        )}
        {isRunning ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleAction("pause"); }}
            disabled={acting}
            title="Pauzeer timer"
            className="rounded p-0.5 text-blue-500 hover:bg-blue-50 disabled:opacity-40"
          >
            <PauseIcon className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleAction("start"); }}
            disabled={acting}
            title="Start timer"
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-green-600 disabled:opacity-40"
          >
            <PlayIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // Uitgebreide versie voor de bewerkmodal
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Tijdregistratie</span>
        {isRunning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            Loopt
          </span>
        )}
      </div>

      <div className={`mb-3 text-2xl font-mono font-semibold tabular-nums ${isRunning ? "text-blue-600" : "text-gray-800"}`}>
        {formatDuration(totalSeconds)}
      </div>

      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={() => handleAction("start")}
            disabled={acting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            Start
          </button>
        ) : (
          <>
            <button
              onClick={() => handleAction("pause")}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <PauseIcon className="h-3.5 w-3.5" />
              Pauzeer
            </button>
            <button
              onClick={() => handleAction("stop")}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <StopIcon className="h-3.5 w-3.5" />
              Stop
            </button>
          </>
        )}
      </div>

      {totalTimeSpent > 0 && currentSession > 0 && (
        <p className="mt-2 text-[10px] text-gray-400">
          Opgeslagen: {formatDuration(totalTimeSpent)} + huidige sessie: {formatDuration(currentSession)}
        </p>
      )}
    </div>
  );
}
