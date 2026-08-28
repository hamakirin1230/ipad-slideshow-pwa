"use client";

import { ChevronDown, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProductDisclosure({
  label,
  children,
  className,
  tone = "dark",
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light";
  defaultOpen?: boolean;
}) {
  return (
    <details
      className={cn(
        "group rounded-xl",
        tone === "light" ? "bg-slate-100" : "bg-white/[0.035]",
        className,
      )}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 [&::-webkit-details-marker]:hidden",
          tone === "light"
            ? "text-slate-700 hover:bg-slate-200 hover:text-slate-950"
            : "text-slate-300 hover:bg-white/5 hover:text-white",
        )}
      >
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        className={cn(
          "px-4 pb-4 pt-2 text-sm leading-6",
          tone === "light" ? "text-slate-600" : "text-slate-400",
        )}
      >
        {children}
      </div>
    </details>
  );
}
