"use client";

import { useEffect, useState } from "react";
import {
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  ArrowTopRightOnSquareIcon,
  FireIcon,
  HomeModernIcon,
  ArrowPathIcon,
  EyeIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

type KansType = "hete_koper" | "opdrachtkans" | "hypotheekkans" | "herwarmen";

type KansItem = {
  contactId: number;
  naam: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  type: KansType;
  warmScore: number;
  points: number;
  bezichtigingInteresse: number | null;
  redenen: string[];
};

type KansGroep = {
  type: KansType;
  label: string;
  beschrijving: string;
  items: KansItem[];
};

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

const GROEP_ICON: Record<KansType, typeof FireIcon> = {
  hete_koper: FireIcon,
  opdrachtkans: HomeModernIcon,
  hypotheekkans: BanknotesIcon,
  herwarmen: ArrowPathIcon,
};

const GROEP_KLEUR: Record<KansType, string> = {
  hete_koper: "text-red-600 bg-red-50",
  opdrachtkans: "text-emerald-600 bg-emerald-50",
  hypotheekkans: "text-indigo-600 bg-indigo-50",
  herwarmen: "text-amber-600 bg-amber-50",
};

function telLink(item: KansItem): string | null {
  const nr = item.phone || item.mobile;
  return nr ? `tel:${nr}` : null;
}

function waLink(item: KansItem): string | null {
  const nr = item.phone || item.mobile;
  if (!nr) return null;
  const clean = nr.replace(/[^0-9]/g, "");
  return `https://wa.me/${clean}`;
}

type InteresseItem = {
  mauticContactId: number;
  slug: string;
  bezoeken: number;
  laatsteBezoek: string;
  voorbeeldUrl: string;
};

export default function KansenBoard() {
  const [groepen, setGroepen] = useState<KansGroep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totaal, setTotaal] = useState(0);
  const [feed, setFeed] = useState<InteresseItem[]>([]);

  useEffect(() => {
    let actief = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [kansenRes, feedRes] = await Promise.all([
          fetch("/api/kansen"),
          fetch("/api/kansen/actieve-interesse"),
        ]);
        const data = await kansenRes.json();
        if (!actief) return;
        if (kansenRes.ok) {
          setGroepen(data.groepen || []);
          setTotaal(data.totaal || 0);
        } else {
          setError(data.error || "Kon kansen niet laden");
        }
        if (feedRes.ok) {
          const feedData = await feedRes.json();
          if (actief) setFeed(feedData.feed || []);
        }
      } catch {
        if (actief) setError("Netwerkfout bij laden van kansen");
      } finally {
        if (actief) setLoading(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Kansen</h1>
        <p className="mt-1 text-gray-500">
          Waar de meeste omzetkans zit, op volgorde van Mautic-score.
          {totaal > 0 && ` ${totaal} kansen.`}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Kansen laden…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {groepen.map((groep) => {
            const Icon = GROEP_ICON[groep.type];
            return (
              <div key={groep.type} className="flex flex-col">
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${GROEP_KLEUR[groep.type]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {groep.label}{" "}
                      <span className="text-gray-400">({groep.items.length})</span>
                    </h2>
                    <p className="text-xs text-gray-500">{groep.beschrijving}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {groep.items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                      Geen kansen in deze groep
                    </p>
                  )}
                  {groep.items.map((item) => {
                    const tel = telLink(item);
                    const wa = waLink(item);
                    return (
                      <div
                        key={item.contactId}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-gray-900">{item.naam}</h3>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            {item.warmScore}
                          </span>
                        </div>

                        {item.redenen.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {item.redenen.map((r, i) => (
                              <li key={i} className="text-xs text-gray-500">
                                · {r}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          {tel && (
                            <a
                              href={tel}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              <PhoneIcon className="h-3.5 w-3.5" /> Bel
                            </a>
                          )}
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                          )}
                          <a
                            href={`${MAUTIC_URL}/s/contacts/view/${item.contactId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> Dossier
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && feed.length > 0 && (
        <div className="mt-10">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <EyeIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Actieve interesse</h2>
              <p className="text-xs text-gray-500">
                Leads die recent dezelfde woning meermaals bekeken — nu opvolgen.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Woning</th>
                  <th className="px-4 py-2 font-medium">Bezoeken</th>
                  <th className="px-4 py-2 font-medium">Laatste</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {feed.map((f) => (
                  <tr
                    key={`${f.mauticContactId}-${f.slug}`}
                    className="border-t border-gray-100"
                  >
                    <td className="px-4 py-2">
                      <a
                        href={`${MAUTIC_URL}/s/contacts/view/${f.mauticContactId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        #{f.mauticContactId}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{f.slug}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {f.bezoeken}×
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(f.laatsteBezoek).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {f.voorbeeldUrl && (
                        <a
                          href={f.voorbeeldUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> Woning
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
