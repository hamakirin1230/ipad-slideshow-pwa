import type { ProjectConsistency } from "@/lib/google-drive";
import { PROJECT_SUMMARY_STALE_WARNING } from "@/lib/project-consistency";

export function ProjectConsistencyWarning({ consistency }: {
  consistency: ProjectConsistency | null;
}) {
  if (consistency !== "summaryStale") return null;
  return (
    <p role="status" className="min-w-0 break-words rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
      {PROJECT_SUMMARY_STALE_WARNING}
    </p>
  );
}
