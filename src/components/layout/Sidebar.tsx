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
  FolderIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  MapPinIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  MagnifyingGlassCircleIcon,
  MegaphoneIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { name: "Telefonie", href: "/telefonie", icon: PhoneIcon },
  { name: "Projecten", href: "/projecten", icon: FolderIcon },
  { name: "Contacten", href: "/contacten", icon: UsersIcon },
  { name: "Pipeline", href: "/pipeline", icon: ChartBarIcon },
  { name: "Taken", href: "/taken", icon: ClipboardDocumentListIcon },
  { name: "Buurtdata", href: "/buurtdata", icon: MapPinIcon },
  { name: "Kijkers", href: "/leads", icon: UserGroupIcon },
  { name: "Samenwerkingen", href: "/samenwerkingen", icon: BuildingOfficeIcon },
  { name: "Realiteitscan", href: "/realiteitscan", icon: MagnifyingGlassCircleIcon },
  { name: "Facebook Triggers", href: "/facebook-triggers", icon: MegaphoneIcon },
  { name: "WhatsApp", href: "/whatsapp", icon: ChatBubbleLeftRightIcon },
];


const externalLinks = [
  {
    name: "Facturatie",
    href: process.env.NEXT_PUBLIC_DEBITEUREN_URL || "#",
    icon: DocumentTextIcon,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white print:hidden">
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
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
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
