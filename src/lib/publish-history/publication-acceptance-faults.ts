import type { DriveProjectSummary } from "../google-drive";
import {
  revalidateProjectRollbackWritePlanInDrive,
} from "./project-rollback-execution-preflight";
import {
  createProjectRollbackIndexMirrorDriveAdapter,
  mirrorProjectRollbackIndexWithAdapter,
  type MirrorProjectRollbackIndexResult,
  type ProjectRollbackIndexMirrorAdapter,
} from "./project-rollback-index-mirror";
import {
  commitProjectRollbackManifestWithAdapter,
  type ProjectRollbackManifestCommitAdapter,
} from "./project-rollback-manifest-commit";
import { createProjectPublishManifestCommitAdapter } from "./project-publish-manifest-commit-adapter";
import { prepareProjectRollbackRevisionInDrive } from "./project-rollback-revision-writer";
import {
  executePreparedProjectRollbackWithAdapter,
  type ProjectRollbackWorkflowResult,
} from "./project-rollback-workflow";
import type { ProjectRollbackWritePlan } from "./project-rollback-write-plan";

export const PUBLICATION_ACCEPTANCE_CASE_A_TITLE =
  "case-a-response-unknown";
export const PUBLICATION_ACCEPTANCE_CASE_C_TITLE = "case-c-index-warning";
export const PUBLICATION_ACCEPTANCE_PRODUCTION_ORIGIN =
  "https://ipad-slideshow-pwa.vercel.app";

export type PublicationAcceptanceFaultKind = "A" | "C";
export type PublicationAcceptanceFaultMode =
  | "off"
  | "aArmed"
  | "aConsumed"
  | "cArmed"
  | "cConsumed";

export type PublicationAcceptanceFaultSnapshot = {
  mode: PublicationAcceptanceFaultMode;
  recoveryReady: boolean;
};

export type PublicationAcceptanceRecoveryStatus =
  | "unavailable"
  | "ready"
  | "running"
  | "success"
  | "stopped";

type PublicationAcceptanceRecoveryPlan = {
  projectTitle: string;
  plan: ProjectRollbackWritePlan;
  ready: boolean;
};

export type PublicationAcceptanceIndexRecoveryResult =
  | {
      ok: true;
      status: "mirrored" | "alreadyMirrored";
      message: string;
    }
  | {
      ok: false;
      status: "stopped";
      category: "retryable" | "conflict" | "requiresInspection";
      message: string;
    };

export class PublicationAcceptanceFaultSession {
  private mode: PublicationAcceptanceFaultMode = "off";
  private recoveryPlan: PublicationAcceptanceRecoveryPlan | null = null;

  getSnapshot(): PublicationAcceptanceFaultSnapshot {
    return {
      mode: this.mode,
      recoveryReady: this.recoveryPlan?.ready === true,
    };
  }

  arm(fault: PublicationAcceptanceFaultKind, projectTitle: string): boolean {
    if (
      this.mode !== "off" ||
      !canArmPublicationAcceptanceFault(fault, projectTitle)
    ) {
      return false;
    }
    this.recoveryPlan = null;
    this.mode = fault === "A" ? "aArmed" : "cArmed";
    return true;
  }

  disarm(): void {
    this.mode = "off";
  }

  clearForProjectChange(): void {
    this.mode = "off";
    this.recoveryPlan = null;
  }

  getArmedFault(projectTitle: string): PublicationAcceptanceFaultKind | null {
    if (
      this.mode === "aArmed" &&
      projectTitle === PUBLICATION_ACCEPTANCE_CASE_A_TITLE
    ) {
      return "A";
    }
    if (
      this.mode === "cArmed" &&
      projectTitle === PUBLICATION_ACCEPTANCE_CASE_C_TITLE
    ) {
      return "C";
    }
    return null;
  }

  isArmed(): boolean {
    return this.mode === "aArmed" || this.mode === "cArmed";
  }

  consume(
    fault: PublicationAcceptanceFaultKind,
    projectTitle: string,
  ): boolean {
    if (this.getArmedFault(projectTitle) !== fault) return false;
    this.mode = fault === "A" ? "aConsumed" : "cConsumed";
    return true;
  }

  retainCRecoveryPlan(
    projectTitle: string,
    plan: ProjectRollbackWritePlan,
  ): boolean {
    if (this.getArmedFault(projectTitle) !== "C") return false;
    this.recoveryPlan = { projectTitle, plan, ready: false };
    return true;
  }

  markCRecoveryReady(projectTitle: string): boolean {
    if (
      this.mode !== "cConsumed" ||
      !this.recoveryPlan ||
      this.recoveryPlan.projectTitle !== projectTitle
    ) {
      this.recoveryPlan = null;
      return false;
    }
    this.recoveryPlan.ready = true;
    return true;
  }

  clearRecoveryPlan(): void {
    this.recoveryPlan = null;
  }

  takeCRecoveryPlan(projectTitle: string): ProjectRollbackWritePlan | null {
    if (
      !this.recoveryPlan?.ready ||
      this.recoveryPlan.projectTitle !== projectTitle ||
      (this.mode !== "cConsumed" && this.mode !== "off")
    ) {
      return null;
    }
    const plan = this.recoveryPlan.plan;
    this.recoveryPlan = null;
    return plan;
  }
}

export function canArmPublicationAcceptanceFault(
  fault: PublicationAcceptanceFaultKind,
  projectTitle: string | null,
): boolean {
  return fault === "A"
    ? projectTitle === PUBLICATION_ACCEPTANCE_CASE_A_TITLE
    : projectTitle === PUBLICATION_ACCEPTANCE_CASE_C_TITLE;
}

export function isPublicationAcceptanceFaultRuntimeEnabled(input?: {
  buildGuard?: string;
  origin?: string;
}): boolean {
  const buildGuard =
    input?.buildGuard ??
    process.env.NEXT_PUBLIC_PUBLICATION_ACCEPTANCE_FAULTS;
  const origin =
    input?.origin ??
    (typeof window === "undefined" ? "" : window.location.origin);
  if (buildGuard !== "1" || !origin) return false;

  try {
    const url = new URL(origin);
    return (
      url.origin !== PUBLICATION_ACCEPTANCE_PRODUCTION_ORIGIN &&
      url.protocol === "https:" &&
      url.hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}

export function wrapPublicationAcceptanceManifestAdapter(input: {
  adapter: ProjectRollbackManifestCommitAdapter;
  session: PublicationAcceptanceFaultSession;
  projectTitle: string;
  onConsumed?: () => void;
}): ProjectRollbackManifestCommitAdapter {
  return {
    ...input.adapter,
    async updateCurrentManifest(updateInput) {
      await input.adapter.updateCurrentManifest(updateInput);
      if (input.session.consume("A", input.projectTitle)) {
        input.onConsumed?.();
        throw new PublicationAcceptanceSyntheticFault();
      }
    },
  };
}

export function wrapPublicationAcceptanceIndexAdapter(input: {
  adapter: ProjectRollbackIndexMirrorAdapter;
  session: PublicationAcceptanceFaultSession;
  projectTitle: string;
  onConsumed?: () => void;
}): ProjectRollbackIndexMirrorAdapter {
  return {
    ...input.adapter,
    async update(updateInput) {
      if (input.session.consume("C", input.projectTitle)) {
        input.onConsumed?.();
        throw new PublicationAcceptanceSyntheticFault();
      }
      await input.adapter.update(updateInput);
    },
  };
}

export async function executePreparedProjectRollbackWithPublicationAcceptanceFaults(input: {
  accessToken: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  plan: ProjectRollbackWritePlan;
  session: PublicationAcceptanceFaultSession;
  onConsumed?: () => void;
  signal?: AbortSignal;
}): Promise<ProjectRollbackWorkflowResult> {
  return executePreparedProjectRollbackWithAdapter(input, {
    revalidate: ({ plan, signal }) =>
      revalidateProjectRollbackWritePlanInDrive({
        accessToken: input.accessToken,
        projectsRootFolderId: input.projectsRootFolderId,
        project: input.project,
        plan,
        signal: signal ?? new AbortController().signal,
      }),
    prepareRevision: ({ plan, signal }) =>
      prepareProjectRollbackRevisionInDrive({
        accessToken: input.accessToken,
        plan,
        signal,
      }),
    commitManifest: ({ plan, signal }) =>
      commitProjectRollbackManifestWithAdapter(
        { plan, signal },
        wrapPublicationAcceptanceManifestAdapter({
          adapter: createProjectPublishManifestCommitAdapter(input.accessToken),
          session: input.session,
          projectTitle: input.project.title,
          onConsumed: input.onConsumed,
        }),
      ),
    mirrorIndex: ({ plan, signal }) =>
      mirrorProjectRollbackIndexWithAdapter(
        { accessToken: input.accessToken, plan, signal },
        wrapPublicationAcceptanceIndexAdapter({
          adapter: createProjectRollbackIndexMirrorDriveAdapter(),
          session: input.session,
          projectTitle: input.project.title,
          onConsumed: input.onConsumed,
        }),
      ),
  });
}

export async function runPublicationAcceptanceIndexRecovery(input: {
  plan: ProjectRollbackWritePlan;
  mirror: (
    plan: ProjectRollbackWritePlan,
  ) => Promise<MirrorProjectRollbackIndexResult>;
}): Promise<PublicationAcceptanceIndexRecoveryResult> {
  const result = await input.mirror(input.plan);
  if (result.ok) {
    return {
      ok: true,
      status: result.status,
      message:
        result.status === "alreadyMirrored"
          ? "index mirrorは既に整合していました。"
          : "index mirrorの明示recoveryが完了しました。",
    };
  }
  return {
    ok: false,
    status: "stopped",
    category: result.recoverability,
    message:
      result.recoverability === "retryable"
        ? "index mirror recoveryを完了できませんでした。自動retryは行いません。"
        : result.recoverability === "conflict"
          ? "fresh index guardが一致しないため、recovery writeを停止しました。"
          : "index mirrorの状態を確定できないため、手動確認が必要です。",
  };
}

class PublicationAcceptanceSyntheticFault extends Error {
  constructor() {
    super("publication acceptance synthetic fault");
    this.name = "PublicationAcceptanceSyntheticFault";
  }
}
