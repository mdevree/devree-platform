import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gratis Buurtrapport | De Vree Makelaardij",
  description:
    "Ontdek alles over uw buurt. Vraag gratis een uitgebreid rapport op voor elk adres in Nederland.",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}
