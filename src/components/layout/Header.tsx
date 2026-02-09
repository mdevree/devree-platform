"use client";

import { useSession, signOut } from "next-auth/react";
import {
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />

      {/* Gebruiker info */}
      <div className="flex items-center gap-4">
        {session?.user && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <UserCircleIcon className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-700">
                {session.user.name}
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {session.user.role}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              Uitloggen
            </button>
          </>
        )}
      </div>
    </header>
  );
}
