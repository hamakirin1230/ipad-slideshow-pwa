export type PwaStandaloneSignals = {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
};

export function isStandalonePwaDisplay({
  displayModeStandalone,
  navigatorStandalone,
}: PwaStandaloneSignals): boolean {
  return displayModeStandalone === true || navigatorStandalone === true;
}
