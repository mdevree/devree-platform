"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  PhoneIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  Squares2X2Icon,
  FolderIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { name: "Telefonie", href: "/telefonie", icon: PhoneIcon },
  { name: "Projecten", href: "/projecten", icon: FolderIcon },
  { name: "Contacten", href: "/contacten", icon: UsersIcon },
  { name: "Pipeline", href: "/pipeline", icon: ChartBarIcon },
  { name: "Taken", href: "/taken", icon: ClipboardDocumentListIcon },
  { name: "Notion", href: "/notion", icon: Squares2X2Icon },
];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const externalLinks = [
  {
    name: "Facturatie",
    href: process.env.NEXT_PUBLIC_DEBITEUREN_URL || "#",
    icon: DocumentTextIcon,
  },
  {
    name: "WhatsApp",
    href: "https://web.whatsapp.com",
    icon: WhatsAppIcon,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-4">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="https://www.devreemakelaardij.nl/wp-content/uploads/2026/01/LOGO-1.png"
            alt="De Vree Makelaardij"
            width={160}
            height={48}
            className="h-10 w-auto object-contain"
            priority
            unoptimized
          />
        </Link>
      </div>

      {/* Navigatie */}
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Menu
        </p>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}

        {/* Instellingen */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <Link
            href="/instellingen"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/instellingen")
                ? "bg-primary/10 text-primary"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Cog6ToothIcon className="h-5 w-5 flex-shrink-0" />
            Instellingen
          </Link>
        </div>

        {/* Externe links */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Extern
          </p>
          {externalLinks.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
              <ArrowTopRightOnSquareIcon className="ml-auto h-4 w-4 text-gray-400" />
            </a>
          ))}
        </div>
      </nav>
    </aside>
  );
}
