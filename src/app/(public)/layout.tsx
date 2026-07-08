import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "De Vree Makelaardij",
  description: "De Vree Makelaardij in Spijkenisse en omgeving.",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}
