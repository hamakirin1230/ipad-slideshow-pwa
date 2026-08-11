"use client";

import Link from "next/link";
import { Activity, Home, LayoutDashboard, Play, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNavigation = [
  { href: "/", label: "Home", icon: Home },
  { href: "/admin", label: "管理", icon: LayoutDashboard },
  { href: "/player", label: "再生", icon: Play },
  { href: "/system", label: "システム", icon: Activity },
] as const;

export function AppNavigation({ pathname }: { pathname: string }) {
  return (
    <>
      <nav
        aria-label="メインナビゲーション"
        className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col border-r border-white/8 bg-slate-950/95 px-3 py-5 backdrop-blur-xl md:flex"
      >
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center rounded-xl text-xs font-bold tracking-[0.18em] text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          aria-label="スライドショー Home"
        >
          SS
        </Link>
        <div className="mt-6 flex flex-1 flex-col gap-2">
          {primaryNavigation.map((item) => (
            <NavigationLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActiveRoute(pathname, item.href)}
              icon={item.icon}
            />
          ))}
        </div>
        <Link
          href="/settings"
          aria-current={isActiveRoute(pathname, "/settings") ? "page" : undefined}
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs text-slate-400 transition hover:bg-white/6 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
            isActiveRoute(pathname, "/settings") &&
              "bg-white/8 text-slate-50",
          )}
        >
          <Settings2 className="size-5" aria-hidden="true" />
          設定
        </Link>
      </nav>

      <nav
        aria-label="メインナビゲーション"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {primaryNavigation.map((item) => (
            <NavigationLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActiveRoute(pathname, item.href)}
              icon={item.icon}
              compact
            />
          ))}
        </div>
      </nav>
    </>
  );
}

function NavigationLink({
  href,
  label,
  active,
  icon: Icon,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: typeof Home;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-12 items-center justify-center rounded-xl px-2 text-xs font-medium text-slate-400 transition hover:bg-white/6 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
        compact ? "flex-col gap-1" : "flex-col gap-1.5",
        active && "bg-sky-400/12 text-sky-200",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" />
      <span>{label}</span>
      {active ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute bg-sky-300",
            compact
              ? "inset-x-5 -bottom-2 h-0.5 rounded-full"
              : "inset-y-3 -left-3 w-0.5 rounded-full",
          )}
        />
      ) : null}
    </Link>
  );
}

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
