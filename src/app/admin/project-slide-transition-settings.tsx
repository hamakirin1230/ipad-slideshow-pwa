"use client";

import { useState, type FormEvent } from "react";
import { useAppState } from "@/app/app-providers";
import { Button } from "@/components/ui/button";
import {
  PROJECT_SLIDE_TRANSITION_HELPER_COPY,
  areProjectSlideTransitionSettingsEqual,
  getEffectiveProjectSlideTransitionStrength,
  projectSlideTransitionFromSelection,
  projectSlideTransitionToSelection,
  projectSlideTransitionUsesStrength,
  type ProjectSlideTransition,
  type ProjectSlideTransitionSelection,
  type ProjectSlideTransitionStrength,
} from "@/lib/project-slide-transition";
import { ProjectSlideTransitionPicker } from "./project-slide-transition-picker";
import { WorkspaceSectionDisclosure } from "./workspace-section-disclosure";

export function ProjectSlideTransitionSettings() {
  const {
    driveStatus,
    projectStatus,
    projectSummary,
    projectTransition,
    projectTransitionStrength,
    isDriveOperationInFlight,
    updateSelectedProjectTransitionSettings,
  } = useAppState();
  const canUpdateSelectedProjectTransition =
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    projectSummary !== null &&
    !isDriveOperationInFlight;

  return (
    <WorkspaceSectionDisclosure
      label="スライド全体の設定"
      headingId="slide-settings-heading"
    >
      <SelectedProjectSlideTransitionForm
        key={`${projectSummary?.projectId ?? "none"}:${projectTransition ?? "standard"}:${projectTransitionStrength ?? "absent"}`}
        projectTransition={projectTransition}
        projectTransitionStrength={projectTransitionStrength}
        hasProject={projectSummary !== null}
        canUpdateSelectedProjectTransition={canUpdateSelectedProjectTransition}
        isDriveOperationInFlight={isDriveOperationInFlight}
        updateSelectedProjectTransitionSettings={updateSelectedProjectTransitionSettings}
      />
    </WorkspaceSectionDisclosure>
  );
}

export function SelectedProjectSlideTransitionForm(input: {
  projectTransition: ProjectSlideTransition | undefined;
  projectTransitionStrength?: ProjectSlideTransitionStrength;
  hasProject: boolean;
  canUpdateSelectedProjectTransition: boolean;
  isDriveOperationInFlight: boolean;
  updateSelectedProjectTransitionSettings: (input: {
    transition: ProjectSlideTransition | undefined;
    transitionStrength?: ProjectSlideTransitionStrength;
  }) => void;
}) {
  const savedSelection = projectSlideTransitionToSelection(input.projectTransition);
  const savedStrength =
    getEffectiveProjectSlideTransitionStrength({
      transition: input.projectTransition,
      transitionStrength: input.projectTransitionStrength,
    }) ?? "standard";
  const [selection, setSelection] =
    useState<ProjectSlideTransitionSelection>(savedSelection);
  const [strength, setStrength] =
    useState<ProjectSlideTransitionStrength>(savedStrength);
  const draftTransition = projectSlideTransitionFromSelection(selection);
  const usesStrength = projectSlideTransitionUsesStrength(draftTransition);
  const canSubmit =
    input.canUpdateSelectedProjectTransition &&
    !areProjectSlideTransitionSettingsEqual(
      {
        transition: input.projectTransition,
        transitionStrength: input.projectTransitionStrength,
      },
      {
        transition: draftTransition,
        transitionStrength: usesStrength ? strength : undefined,
      },
    );

  function handleEffectChange(nextSelection: ProjectSlideTransitionSelection) {
    const previousUsesStrength = projectSlideTransitionUsesStrength(
      projectSlideTransitionFromSelection(selection),
    );
    const nextUsesStrength = projectSlideTransitionUsesStrength(
      projectSlideTransitionFromSelection(nextSelection),
    );
    setSelection(nextSelection);
    if (!nextUsesStrength || !previousUsesStrength) {
      setStrength("standard");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    input.updateSelectedProjectTransitionSettings({
      transition: draftTransition,
      transitionStrength: usesStrength ? strength : undefined,
    });
  }

  return (
    <form
      className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4"
      onSubmit={handleSubmit}
    >
      <p className="font-semibold text-slate-50">スライド切り替え</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        {PROJECT_SLIDE_TRANSITION_HELPER_COPY}
      </p>
      <ProjectSlideTransitionPicker
        selection={selection}
        strength={strength}
        disabled={!input.hasProject || input.isDriveOperationInFlight}
        onEffectChange={handleEffectChange}
        onStrengthChange={setStrength}
      />
      {canSubmit ? (
        <p role="status" className="mt-4 text-sm text-amber-200">
          未保存の変更があります
        </p>
      ) : null}
      <Button
        type="submit"
        className="mt-4 min-h-11 w-full"
        variant="secondary"
        disabled={!canSubmit}
      >
        スライド切り替えを保存
      </Button>
    </form>
  );
}
