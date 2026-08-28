export type HomeLaunchKind =
  | "connectGoogle"
  | "prepareWorkspace"
  | "createAlbum"
  | "saveLocally"
  | "play";

export type HomeLaunchAction = {
  kind: HomeLaunchKind;
  label: string;
  href: string;
};

export function resolveHomeLaunchAction(input: {
  googleStatus: string;
  driveStatus: string;
  projectStatus: string;
  albumCount: number;
  hasLocalPlaybackCopy: boolean;
}): HomeLaunchAction {
  if (input.hasLocalPlaybackCopy) {
    return { kind: "play", label: "再生する", href: "/player" };
  }

  if (input.googleStatus !== "connected") {
    return {
      kind: "connectGoogle",
      label: "Googleアカウントでつなぐ",
      href: "/settings",
    };
  }

  if (input.driveStatus !== "ready") {
    return {
      kind: "prepareWorkspace",
      label: "保存場所を準備する",
      href: "/settings",
    };
  }

  if (input.albumCount === 0 || input.projectStatus === "notCreated") {
    return {
      kind: "createAlbum",
      label: "アルバムをつくる",
      href: "/admin",
    };
  }

  return {
    kind: "saveLocally",
    label: "ローカルに保存する",
    href: "/admin#device",
  };
}

export function hasReadyLocalPlaybackCopy(input: {
  projects: Array<{ projectId: string }>;
  syncStates: Array<{ projectId: string; status: string }>;
}) {
  const projectIds = new Set(input.projects.map((project) => project.projectId));
  return input.syncStates.some(
    (state) => state.status === "ready" && projectIds.has(state.projectId),
  );
}
