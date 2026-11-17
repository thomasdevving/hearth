// The time machine (docs/08 §3): +1 day, Play, Jump to…
import { autoAnswer, autoOnboard, onSafety } from "../app/actions";
import { BLOCKING, currentReplay, getMeta, openInbox, stepDay, loadPersona } from "../app/runtime";
import { getSettings, db } from "../store/db";
import { emitChange, navigate } from "../app/events";
import type { InboxItem } from "../store/db";
import type { Scenario } from "@hearth/engine";

export type JumpTarget = "holiday" | "first_change" | "phq9";

type Listener = () => void;

class TimeMachine {
  playing = false;
  busy = false;
  autoAnswer = false;
  message: string | null = null;
  private listeners = new Set<Listener>();
  private stopRequested = false;

  constructor() {
    onSafety(() => this.pause("The support screen opened."));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
    emitChange();
  }

  setAutoAnswer(v: boolean) {
    this.autoAnswer = v;
    this.emit();
  }

  pause(message: string | null = null) {
    this.playing = false;
    this.stopRequested = true;
    this.message = message;
    this.emit();
  }

  async load(scenario: Scenario, seed: number) {
    this.pause();
    await loadPersona(scenario, seed);
    this.message = `Loaded ${scenario} scenario, seed ${seed}.`;
    this.emit();
  }

  private async blocking(): Promise<InboxItem[]> {
    return (await openInbox()).filter((i) => BLOCKING.includes(i.type));
  }

  /** Answer open items with the script until none is left, unless `stopAt` says to leave one. */
  private async drain(stopAt?: (item: InboxItem) => Promise<boolean>): Promise<boolean> {
    for (let guard = 0; guard < 20; guard++) {
      const items = await this.blocking();
      if (items.length === 0) return false;
      for (const item of items) {
        if (stopAt && (await stopAt(item))) return true;
        await autoAnswer(item);
        if (this.stopRequested) return true;
      }
    }
    return false;
  }

  /** One day. Interactive: stops on items that need the user. */
  async step(): Promise<"ok" | "paused" | "end"> {
    if (this.busy) return "paused";
    this.busy = true;
    try {
      const s = await getSettings();
      if (!s.baselineDone && this.autoAnswer) await autoOnboard();
      if ((await this.blocking()).length > 0) {
        if (!this.autoAnswer) return "paused";
        await this.drain();
      }
      const r = await stepDay(this.autoAnswer ? { onNote: async (item) => (await autoAnswer(item), true) } : {});
      if (this.autoAnswer) await this.drain();
      else {
        // my_plan opens by itself when a change starts (docs/01 §4).
        const meta = await getMeta();
        if ((await openInbox()).some((i) => i.type === "show_plan" && i.date === meta?.today)) {
          this.pause("Your signals changed: your plan is shown.");
          navigate("my_plan");
        }
      }
      this.emit();
      return r;
    } finally {
      this.busy = false;
    }
  }

  async play() {
    if (this.playing) return;
    this.playing = true;
    this.stopRequested = false;
    this.message = null;
    this.emit();
    while (this.playing && !this.stopRequested) {
      const r = await this.step();
      if (r === "end") {
        this.pause("End of the replay.");
        break;
      }
      if (r === "paused" || (!this.autoAnswer && (await this.blocking()).length > 0)) {
        this.pause("Paused: something needs you.");
        break;
      }
      await new Promise((res) => setTimeout(res, 400));
    }
  }

  /** Fast-forward with scripted answers auto-accepted (docs/08 §3). */
  async jump(target: JumpTarget) {
    if (this.busy) return;
    this.pause();
    this.stopRequested = false;
    this.busy = true;
    this.message = "Fast-forwarding…";
    this.emit();
    try {
      const data = await currentReplay();
      if (!data) return;
      await autoOnboard();
      const firstElevated0 = async () => (await db.day_records.toArray()).some((r) => r.state === "ELEVATED");
      if (await this.drain(async (item) => target === "phq9" && item.type === "questionnaire" && (await firstElevated0()))) {
        this.message = "A questionnaire is offered.";
        return;
      }
      const holidayDay = data.phases.find((p) => p.name === "Holiday")?.fromDay ?? 61;
      const firstElevated = async () => (await db.day_records.toArray()).some((r) => r.state === "ELEVATED");
      const elevatedBefore = await firstElevated();
      for (let guard = 0; guard < 400; guard++) {
        const meta = await getMeta();
        if (!meta) break;
        if (target === "holiday" && meta.dayNumber >= holidayDay - 1) {
          this.busy = false;
          const r = await stepDayInteractive();
          this.message = r === "paused" ? "Day of the holiday: Sam wrote a note." : "Holiday reached.";
          break;
        }
        const r = await stepDay({ onNote: async (item) => (await autoAnswer(item), true) });
        if (r === "end") {
          this.message = "End of the replay.";
          break;
        }
        let stop = false;
        if (target === "first_change" && !elevatedBefore && (await firstElevated())) stop = true;
        if (stop) {
          this.message = "First change: the index crossed your usual range.";
          navigate("my_plan");
          break;
        }
        const halted = await this.drain(async (item) => target === "phq9" && item.type === "questionnaire" && (await firstElevated()));
        if (halted) {
          this.message = this.stopRequested ? this.message : "A questionnaire is offered.";
          break;
        }
        if (this.stopRequested) break;
      }
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}

async function stepDayInteractive() {
  return stepDay({});
}

export const timeMachine = new TimeMachine();
