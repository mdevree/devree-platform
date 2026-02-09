"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  XMarkIcon,
  UserPlusIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

interface CallEventData {
  callId: string;
  timestamp: string;
  status: string;
  reason?: string;
  direction: string;
  callerNumber: string;
  callerName?: string;
  destinationNumber: string;
  destinationUser?: string;
  mauticContactId?: number;
  contactName?: string;
  contactFound: boolean;
}

export default function CallNotification() {
  const [activeCall, setActiveCall] = useState<CallEventData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const dismissCall = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setActiveCall(null), 300);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource("/api/calls/stream");

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "call-ringing") {
          setActiveCall(parsed.data);
          setIsVisible(true);
        } else if (parsed.type === "call-ended") {
          // Update actieve call als het dezelfde is
          if (activeCall?.callId === parsed.data.callId) {
            setActiveCall(parsed.data);
            // Auto-dismiss na 8 seconden bij ended
            setTimeout(dismissCall, 8000);
          }
        }
      } catch {
        // Negeer parse fouten (bijv. heartbeat)
      }
    };

    eventSource.onerror = () => {
      // Automatisch herverbinden wordt door EventSource afgehandeld
      console.log("SSE verbinding verbroken, herverbinden...");
    };

    return () => {
      eventSource.close();
    };
  }, [activeCall?.callId, dismissCall]);

  // Auto-dismiss na 30 seconden
  useEffect(() => {
    if (isVisible) {
      const timeout = setTimeout(dismissCall, 30000);
      return () => clearTimeout(timeout);
    }
  }, [isVisible, dismissCall]);

  if (!activeCall) return null;

  const isInbound = activeCall.direction === "inbound";
  const isRinging = activeCall.status === "ringing" || activeCall.status === "in-progress";
  const displayNumber = isInbound
    ? activeCall.callerNumber
    : activeCall.destinationNumber;

  return (
    <div
      className={`fixed right-6 top-20 z-50 w-80 transition-all duration-300 ${
        isVisible
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      }`}
    >
      <div
        className={`overflow-hidden rounded-xl shadow-2xl border ${
          isRinging
            ? "border-primary/30 bg-white animate-pulse"
            : "border-gray-200 bg-white"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 ${
            isInbound ? "bg-primary" : "bg-gray-700"
          } text-white`}
        >
          <div className="flex items-center gap-2">
            {isInbound ? (
              <PhoneArrowDownLeftIcon className="h-5 w-5" />
            ) : (
              <PhoneArrowUpRightIcon className="h-5 w-5" />
            )}
            <span className="text-sm font-medium">
              {isRinging
                ? isInbound
                  ? "Inkomend gesprek..."
                  : "Uitgaand gesprek..."
                : activeCall.reason === "completed"
                ? "Gesprek beëindigd"
                : "Gemist gesprek"}
            </span>
          </div>
          <button
            onClick={dismissCall}
            className="rounded-full p-1 transition-colors hover:bg-white/20"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Telefoonnummer */}
          <p className="text-lg font-semibold text-gray-900">
            {activeCall.callerName || displayNumber}
          </p>
          {activeCall.callerName && (
            <p className="text-sm text-gray-500">{displayNumber}</p>
          )}

          {/* Contact info */}
          {activeCall.contactFound ? (
            <div className="mt-3 rounded-lg bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  {activeCall.contactName}
                </span>
              </div>
              {activeCall.mauticContactId && (
                <a
                  href={`${process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl"}/s/contacts/view/${activeCall.mauticContactId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Bekijk in Mautic →
                </a>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-2">
                <UserPlusIcon className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-800">
                  Onbekend contact
                </span>
              </div>
              <a
                href={`/telefonie?nieuw=${encodeURIComponent(displayNumber)}`}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200"
              >
                <UserPlusIcon className="h-3 w-3" />
                Contact aanmaken
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
