export const DUPLICATE_PROJECT_TITLE_MESSAGE =
  "同じ名前のアルバムがすでにあります。別の名前を入力してください。";

export function normalizeProjectTitleForComparison(title: string): string {
  return title.trim().toLowerCase();
}

export function hasConflictingProjectTitle(input: {
  title: string;
  projects: ReadonlyArray<{ projectId: string; title: string }>;
  ignoreProjectId?: string;
}): boolean {
  const normalizedTitle = normalizeProjectTitleForComparison(input.title);
  if (normalizedTitle.length === 0) {
    return false;
  }

  return input.projects.some((project) => {
    if (
      input.ignoreProjectId !== undefined &&
      project.projectId === input.ignoreProjectId
    ) {
      return false;
    }

    return (
      normalizeProjectTitleForComparison(project.title) === normalizedTitle
    );
  });
}
