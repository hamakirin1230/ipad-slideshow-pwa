"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canArmPublicationAcceptanceFault,
  type PublicationAcceptanceFaultKind,
  type PublicationAcceptanceFaultMode,
  type PublicationAcceptanceRecoveryStatus,
} from "@/lib/publish-history/publication-acceptance-faults";

export function PublicationAcceptanceFaultPanel(props: {
  enabled: boolean;
  mode: PublicationAcceptanceFaultMode;
  recoveryStatus: PublicationAcceptanceRecoveryStatus;
  recoveryMessage: string;
  selectedProjectTitle: string | null;
  busy: boolean;
  onArm: (fault: PublicationAcceptanceFaultKind) => void;
  onDisarm: () => void;
  onRecover: () => void;
}) {
  if (!props.enabled) return null;

  const canArmA =
    props.mode === "off" &&
    !props.busy &&
    canArmPublicationAcceptanceFault("A", props.selectedProjectTitle);
  const canArmC =
    props.mode === "off" &&
    !props.busy &&
    canArmPublicationAcceptanceFault("C", props.selectedProjectTitle);
  const canRecover =
    props.recoveryStatus === "ready" &&
    (props.mode === "cConsumed" || props.mode === "off") &&
    !props.busy;

  return (
    <Card className="border-fuchsia-400/40 bg-fuchsia-400/10 text-slate-50">
      <CardHeader>
        <CardTitle>Publication acceptance fault</CardTitle>
        <CardDescription className="text-fuchsia-100">
          Preview guard: enabled / acceptance branch only
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-300">Mode</dt>
            <dd className="font-semibold">{formatFaultMode(props.mode)}</dd>
          </div>
          <div>
            <dt className="text-slate-300">C recovery</dt>
            <dd className="font-semibold">
              {formatRecoveryStatus(props.recoveryStatus)}
            </dd>
          </div>
        </dl>
        <p role="status" aria-live="polite" className="text-sm text-fuchsia-50">
          {props.recoveryMessage}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={!canArmA}
            onClick={() => props.onArm("A")}
          >
            Arm A
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={!canArmC}
            onClick={() => props.onArm("C")}
          >
            Arm C
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={props.mode === "off" || props.busy}
            onClick={props.onDisarm}
          >
            Disarm
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!canRecover}
            onClick={props.onRecover}
          >
            Recover C index
          </Button>
        </div>
        {!canArmA && !canArmC && props.mode === "off" ? (
          <p className="text-xs text-slate-300">
            選択中projectはA/C acceptance faultの対象外です。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatFaultMode(mode: PublicationAcceptanceFaultMode) {
  switch (mode) {
    case "aArmed":
      return "A armed";
    case "aConsumed":
      return "A consumed";
    case "cArmed":
      return "C armed";
    case "cConsumed":
      return "C consumed";
    default:
      return "OFF";
  }
}

function formatRecoveryStatus(status: PublicationAcceptanceRecoveryStatus) {
  switch (status) {
    case "ready":
      return "ready";
    case "running":
      return "running";
    case "success":
      return "success";
    case "stopped":
      return "stopped";
    default:
      return "unavailable";
  }
}
