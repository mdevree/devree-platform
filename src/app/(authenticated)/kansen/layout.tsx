import Link from "next/link";
export default function KansenLayout({children}:{children:React.ReactNode}) {
  return <div className="space-y-5"><nav aria-label="Kansen onderdelen" className="flex gap-2 border-b pb-3"><Link className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50" href="/kansen">Opvolgkansen</Link><Link className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50" href="/kansen/vroege-signalen">Vroege signalen</Link></nav>{children}</div>;
}
