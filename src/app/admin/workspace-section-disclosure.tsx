"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceSectionDisclosure({
  label,
  headingId,
  defaultOpen = false,
  className,
  children,
}: {
  label: string;
  headingId: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className={className}>
      <details className="group/section min-w-0" open={defaultOpen}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 [&::-webkit-details-marker]:hidden">
          <h3 id={headingId} className="min-w-0 flex-1 text-lg font-semibold">
            {label}
          </h3>
          <ChevronDown
            className="size-5 shrink-0 group-open/section:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-4 min-w-0">{children}</div>
      </details>
    </section>
  );
}
