export type PwaStandaloneSignals = {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
};

export type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform?: string;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

export type PwaInstallActionMode =
  | "hidden"
  | "manual"
  | "direct"
  | "promptPending";

export function isStandalonePwaDisplay({
  displayModeStandalone,
  navigatorStandalone,
}: PwaStandaloneSignals): boolean {
  return displayModeStandalone === true || navigatorStandalone === true;
}

export function resolvePwaInstallActionMode(input: {
  displayResolved: boolean;
  standalone: boolean;
  directPromptAvailable: boolean;
  promptPending: boolean;
}): PwaInstallActionMode {
  if (!input.displayResolved || input.standalone) {
    return "hidden";
  }
  if (input.promptPending) {
    return "promptPending";
  }
  return input.directPromptAvailable ? "direct" : "manual";
}
