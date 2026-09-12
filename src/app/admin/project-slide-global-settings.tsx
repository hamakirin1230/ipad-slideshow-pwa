"use client";

import { useState } from "react";
import { useAppState } from "@/app/app-providers";
import { ProjectSlideCaptionStyleSettings } from "./project-slide-caption-style-settings";
import { ProjectSlideTransitionSettings } from "./project-slide-transition-settings";
import { WorkspaceSectionDisclosure } from "./workspace-section-disclosure";

export function ProjectSlideGlobalSettings() {
  const { projectSummary } = useAppState();
  return <GlobalSettingsContent key={projectSummary?.projectId ?? "none"} />;
}

function GlobalSettingsContent() {
  const [captionDirty, setCaptionDirty] = useState(false);
  const [transitionDirty, setTransitionDirty] = useState(false);
  return (
    <WorkspaceSectionDisclosure label="スライド全体の設定" headingId="slide-settings-heading" dirty={captionDirty || transitionDirty}>
      <div className="space-y-4">
        <ProjectSlideCaptionStyleSettings onDirtyChange={setCaptionDirty} />
        <ProjectSlideTransitionSettings onDirtyChange={setTransitionDirty} />
      </div>
    </WorkspaceSectionDisclosure>
  );
}
