"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppNavigation } from "./app-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/player" || pathname.startsWith("/player/")) {
    return children;
  }

  return (
    <div className="dark min-h-svh bg-slate-950 text-slate-50 md:pl-24">
      <AppNavigation pathname={pathname} />
      <div className="min-h-svh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </div>
  );
}
