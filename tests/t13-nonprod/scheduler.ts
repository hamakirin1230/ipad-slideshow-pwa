export type Worker = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type Barrier = "read" | "update" | "commit" | "response";
export type Step = Readonly<{ worker: Worker; barrier: Barrier }>;

/** Explicit gates, not timing delays. This schedules synthetic tasks only. */
export class Scheduler {
  private gates = new Map<string, () => void>();
  private arrivals = new Map<string, Promise<void>>();
  private arrived = new Map<string, () => void>();
  private order: Step[] = [];

  constructor(private readonly plan: readonly Step[]) {
    if (new Set(plan.map(step => this.key(step))).size !== plan.length) {
      throw new Error("duplicate-synthetic-step");
    }
    for (const step of plan) {
      this.arrivals.set(this.key(step), new Promise(resolve => {
        this.arrived.set(this.key(step), resolve);
      }));
    }
  }

  async wait(step: Step): Promise<void> {
    const key = this.key(step);
    const signal = this.arrived.get(key);
    if (!signal || this.gates.has(key)) throw new Error("unexpected-synthetic-step");
    const gate = new Promise<void>(resolve => this.gates.set(key, resolve));
    this.arrived.delete(key);
    signal();
    await gate;
  }

  async releaseNext(): Promise<void> {
    const step = this.plan[this.order.length];
    if (!step) throw new Error("synthetic-schedule-complete");
    await this.arrivals.get(this.key(step));
    this.order.push({ ...step });
    this.gates.get(this.key(step))!();
  }

  trace(): readonly Step[] { return this.order.map(step => ({ ...step })); }
  private key(step: Step): string { return `${step.worker}:${step.barrier}`; }
}
