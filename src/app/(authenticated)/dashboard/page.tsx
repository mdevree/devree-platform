import { auth } from "@/lib/auth";
import {
  PhoneIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div>
      {/* Welkom */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Goedemorgen, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-gray-500">
          Welkom bij het kantoor platform van De Vree Makelaardij.
        </p>
      </div>

      {/* Snelkoppelingen */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/telefonie"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <PhoneIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-primary">
                Telefonie
              </h3>
              <p className="text-sm text-gray-500">
                Bel overzicht en contacten
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/taken"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
              <ClipboardDocumentListIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-primary">
                Taken
              </h3>
              <p className="text-sm text-gray-500">
                Beheer je taken en opdrachten
              </p>
            </div>
          </div>
        </Link>

        <a
          href={process.env.NEXT_PUBLIC_DEBITEUREN_URL || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50">
              <DocumentTextIcon className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 group-hover:text-primary">
                  Facturatie
                </h3>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">
                Debiteuren administratie
              </p>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
