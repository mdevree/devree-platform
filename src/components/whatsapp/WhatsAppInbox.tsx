"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  waPhone: string;
  waName: string | null;
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  mauticContactId: number | null;
  messages: Message[];
};

const MAUTIC_URL = process.env.NEXT_PUBLIC_MAUTIC_URL ?? "";

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED">("OPEN");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeId);

  function displayName(conv: Conversation) {
    return conv.waName ?? conv.waPhone.replace("@s.whatsapp.net", "");
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }

  async function loadConversations() {
    const res = await fetch(`/api/whatsapp/conversations?status=${statusFilter}`);
    if (res.ok) setConversations(await res.json());
  }

  async function loadMessages(id: string) {
    const res = await fetch(`/api/whatsapp/conversations/${id}/messages`);
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => {
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
      if (activeId) loadMessages(activeId);
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, statusFilter]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!reply.trim() || !activeId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setMessages((prev) => [...prev, newMsg]);
        setReply("");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!activeId) return;
    await fetch(`/api/whatsapp/conversations/${activeId}/close`, { method: "POST" });
    setConversations((prev) => prev.filter((c) => c.id !== activeId));
    setActiveId(null);
    setMessages([]);
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Gesprekkenlijst */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">WhatsApp</h1>
          <div className="mt-2 flex gap-2">
            {(["OPEN", "CLOSED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setActiveId(null);
                  setMessages([]);
                }}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "OPEN" ? "Open" : "Gesloten"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-gray-400 text-center mt-8">Geen gesprekken</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                activeId === conv.id ? "bg-primary/10 border-l-2 border-l-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900 truncate">
                  {displayName(conv)}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              {conv.messages[0] && (
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {conv.messages[0].direction === "OUTBOUND" ? "↗ " : ""}
                  {conv.messages[0].body}
                </p>
              )}
              {conv.mauticContactId && (
                <span className="text-xs text-primary mt-0.5 block">
                  Mautic #{conv.mauticContactId}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chatvenster */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p className="text-sm">Selecteer een gesprek</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div>
                <h2 className="font-semibold text-gray-900">{displayName(activeConversation)}</h2>
                <p className="text-xs text-gray-500">
                  {activeConversation.waPhone.replace("@s.whatsapp.net", "")}
                  {activeConversation.mauticContactId && MAUTIC_URL && (
                    <a
                      href={`${MAUTIC_URL}/s/contacts/view/${activeConversation.mauticContactId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-primary hover:underline"
                    >
                      Mautic →
                    </a>
                  )}
                </p>
              </div>
              {activeConversation.status === "OPEN" && (
                <button
                  onClick={handleClose}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Gesprek sluiten
                </button>
              )}
            </div>

            {/* Berichten */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-sm px-4 py-2 rounded-2xl text-sm ${
                      msg.direction === "OUTBOUND"
                        ? "bg-primary text-white rounded-br-sm"
                        : "bg-white text-gray-800 shadow-sm rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.direction === "OUTBOUND" ? "text-white/70" : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply */}
            {activeConversation.status === "OPEN" ? (
              <div className="p-4 border-t border-gray-200 bg-white flex gap-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Typ een bericht… (Enter = versturen, Shift+Enter = nieuwe regel)"
                  rows={2}
                  className="flex-1 resize-none text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? "…" : "Stuur"}
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-gray-200 bg-gray-50 text-center text-sm text-gray-400">
                Gesprek is gesloten
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
