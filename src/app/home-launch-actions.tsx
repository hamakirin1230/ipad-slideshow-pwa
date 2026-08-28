"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, HardDrive, Pencil, Play, Settings2 } from "lucide-react";
import { useAppState } from "@/app/app-providers";
import { shouldAutoCheckProject } from "@/app/admin/project-delete-view";
import { Button } from "@/components/ui/button";
import {
  resolveHomeLaunchAction,
  hasReadyLocalPlaybackCopy,
  type HomeLaunchAction,
} from "@/lib/home-launch-action";
import { readOfflineConfirmedStoreSnapshot } from "@/lib/offline-confirmed-store-snapshot";
import { cn } from "@/lib/utils";

const primaryButtonClassName =
  "min-h-14 justify-between gap-8 rounded-xl bg-sky-300 px-6 text-base font-semibold text-slate-950 hover:bg-sky-200";
const secondaryButtonClassName =
  "min-h-14 gap-3 rounded-xl border-white/15 bg-white/5 px-6 text-base text-slate-50 hover:bg-white/10";

export function HomeLaunchActions() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    driveProjects,
    isDriveOperationInFlight,
    checkProject,
  } = useAppState();
  const [hasLocalPlaybackCopy, setHasLocalPlaybackCopy] = useState(false);

  useEffect(() => {
    if (
      shouldAutoCheckProject({
        driveStatus,
        projectStatus,
        isDriveOperationInFlight,
      })
    ) {
      checkProject();
    }
  }, [checkProject, driveStatus, isDriveOperationInFlight, projectStatus]);

  useEffect(() => {
    let cancelled = false;

    void readOfflineConfirmedStoreSnapshot()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        setHasLocalPlaybackCopy(
          hasReadyLocalPlaybackCopy({
            projects: snapshot.projects,
            syncStates: snapshot.syncStates,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHasLocalPlaybackCopy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const primary = resolveHomeLaunchAction({
    googleStatus,
    driveStatus,
    projectStatus,
    albumCount: driveProjects.length,
    hasLocalPlaybackCopy,
  });

  return (
    <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <LaunchButton action={primary} prominent />
      {primary.kind !== "createAlbum" ? (
        <LaunchButton
          action={{ kind: "createAlbum", label: "つくる", href: "/admin" }}
        />
      ) : null}
      {primary.kind !== "play" ? (
        <LaunchButton
          action={{ kind: "play", label: "再生する", href: "/player" }}
        />
      ) : null}
    </div>
  );
}

function LaunchButton({
  action,
  prominent = false,
}: {
  action: HomeLaunchAction;
  prominent?: boolean;
}) {
  return (
    <Button
      asChild
      variant={prominent ? "default" : "outline"}
      className={cn(
        prominent ? primaryButtonClassName : secondaryButtonClassName,
      )}
    >
      <Link href={action.href}>
        <span className="flex items-center gap-3">
          <LaunchIcon kind={action.kind} prominent={prominent} />
          {action.label}
        </span>
        {prominent ? <ArrowRight className="size-5" aria-hidden="true" /> : null}
      </Link>
    </Button>
  );
}

function LaunchIcon({
  kind,
  prominent,
}: {
  kind: HomeLaunchAction["kind"];
  prominent: boolean;
}) {
  const className = cn(
    "size-5",
    kind === "play" && prominent && "fill-current",
  );

  switch (kind) {
    case "connectGoogle":
    case "prepareWorkspace":
      return <Settings2 className={className} aria-hidden="true" />;
    case "createAlbum":
      return <Pencil className={className} aria-hidden="true" />;
    case "saveLocally":
      return <HardDrive className={className} aria-hidden="true" />;
    case "play":
      return <Play className={className} aria-hidden="true" />;
  }
}
