"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: string;
  deliveryStatus?: "SENT" | "FAILED" | null;
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

type MauticContactFull = {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
  address1: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
  website: string | null;
  tags: string[];
  dateAdded: string | null;
};

const MAUTIC_URL = process.env.NEXT_PUBLIC_MAUTIC_URL ?? "";

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED">("OPEN");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [contactDetail, setContactDetail] = useState<MauticContactFull | null>(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);
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

  function formatDateFull(iso: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
    const id = new URLSearchParams(window.location.search).get("conversation");
    if (id) {
      // Queryparameter selecteert het gesprek na navigatie vanuit Contacten.
      setActiveId(id);
      setInitialConversationId(id);
    }
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!initialConversationId) return;
    if (conversations.some((c) => c.id === initialConversationId)) {
      setActiveId(initialConversationId);
      setInitialConversationId(null);
    }
  }, [conversations, initialConversationId]);

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
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!reply.trim() || !activeId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (data) setMessages((prev) => [...prev, data]);
        setReply("");
      } else {
        // Toon de fout én het mislukte bericht (server bewaart het als FAILED).
        setError(data?.error || "Bericht kon niet worden verzonden");
        if (data?.message) setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      setError("Netwerkfout bij verzenden");
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

  async function openContactPanel(mauticContactId: number) {
    setShowContactPanel(true);
    setContactDetail(null);
    setContactDetailLoading(true);

    try {
      const res = await fetch(`/api/mautic/contact?id=${mauticContactId}&full=1`);
      const data = await res.json();
      setContactDetail(data.contact ?? null);
    } catch {
      setContactDetail(null);
    } finally {
      setContactDetailLoading(false);
    }
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
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeConversation.mauticContactId && (
                  <>
                    <button
                      onClick={() => openContactPanel(activeConversation.mauticContactId!)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      title="Contact details"
                    >
                      <UserCircleIcon className="h-4 w-4" />
                      Contact
                    </button>
                    {MAUTIC_URL && (
                      <a
                        href={`${MAUTIC_URL}/s/contacts/view/${activeConversation.mauticContactId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="Openen in Mautic"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </a>
                    )}
                  </>
                )}
                {activeConversation.status === "OPEN" && (
                  <button
                    onClick={handleClose}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Gesprek sluiten
                  </button>
                )}
              </div>
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
                      msg.deliveryStatus === "FAILED"
                        ? "bg-red-50 text-gray-800 border border-red-300 rounded-br-sm"
                        : msg.direction === "OUTBOUND"
                          ? "bg-primary text-white rounded-br-sm"
                          : "bg-white text-gray-800 shadow-sm rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.deliveryStatus === "FAILED"
                          ? "text-red-600"
                          : msg.direction === "OUTBOUND"
                            ? "text-white/70"
                            : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.createdAt)}
                      {msg.deliveryStatus === "FAILED" && " · niet verzonden"}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply */}
            {activeConversation.status === "OPEN" ? (
              <div className="border-t border-gray-200 bg-white">
                {error && (
                  <div className="px-4 pt-3 text-sm text-red-600">
                    {error}
                  </div>
                )}
                <div className="p-4 flex gap-3">
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
              </div>
            ) : (
              <div className="p-4 border-t border-gray-200 bg-gray-50 text-center text-sm text-gray-400">
                Gesprek is gesloten
              </div>
            )}
          </>
        )}
      </div>

      {showContactPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowContactPanel(false)} />
          <div className="w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">Contact details</h2>
              </div>
              <button
                onClick={() => setShowContactPanel(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {contactDetailLoading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Laden...</p>
              </div>
            ) : !contactDetail ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Contact niet gevonden</p>
              </div>
            ) : (
              <div className="space-y-6 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {[contactDetail.firstname, contactDetail.lastname].filter(Boolean).join(" ") || "Onbekend"}
                    </h3>
                    {contactDetail.company && (
                      <p className="text-sm text-gray-500">{contactDetail.company}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {contactDetail.points} pts
                    </span>
                    {MAUTIC_URL && (
                      <a
                        href={`${MAUTIC_URL}/s/contacts/view/${contactDetail.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                        title="Openen in Mautic"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                {contactDetail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {contactDetail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  <div className="px-4 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Contactgegevens</p>
                  </div>
                  {[
                    ["E-mail", contactDetail.email, contactDetail.email ? `mailto:${contactDetail.email}` : null],
                    ["Telefoon", contactDetail.phone, null],
                    ["Mobiel", contactDetail.mobile, null],
                    ["Website", contactDetail.website, contactDetail.website],
                    ["Adres", contactDetail.address1, null],
                    ["Postcode", contactDetail.zipcode, null],
                    ["Stad", contactDetail.city, null],
                    ["Land", contactDetail.country, null],
                  ].map(([label, value, href]) => {
                    if (!value) return null;
                    return (
                      <div key={label} className="grid grid-cols-3 items-center px-4 py-2 text-sm">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="col-span-2 break-all text-gray-900">
                          {href ? (
                            <a href={href} target={String(href).startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-primary hover:underline">
                              {value}
                            </a>
                          ) : (
                            value
                          )}
                        </span>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-3 px-4 py-2 text-sm">
                    <span className="text-xs text-gray-500">Toegevoegd</span>
                    <span className="col-span-2 text-gray-900">{formatDateFull(contactDetail.dateAdded)}</span>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-2 text-sm">
                    <span className="text-xs text-gray-500">Laatste actie</span>
                    <span className="col-span-2 text-gray-900">{formatDateFull(contactDetail.lastActive)}</span>
                  </div>
                </div>

                {MAUTIC_URL && (
                  <a
                    href={`${MAUTIC_URL}/s/contacts/view/${contactDetail.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Volledig profiel in Mautic
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
