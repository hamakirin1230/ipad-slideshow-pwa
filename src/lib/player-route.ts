export function createPlayerProjectLinkHref(projectId: string) {
  const normalizedProjectId = projectId.trim();

  if (normalizedProjectId.length === 0) {
    return null;
  }

  return {
    pathname: "/player",
    query: { projectId: normalizedProjectId },
  } as const;
}
