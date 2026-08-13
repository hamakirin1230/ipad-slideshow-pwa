"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AppProviders } from "./app-providers";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/share/")) {
    return children;
  }
  return (
    <>
      <ServiceWorkerRegistration />
      <AppProviders>
        <AppShell>{children}</AppShell>
      </AppProviders>
    </>
  );
}
