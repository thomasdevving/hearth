import "fake-indexeddb/auto";

// jsdom's AbortSignal lacks any(); Chrome has it and the Firebase SDK uses it.
const AS = AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal };
if (typeof AS.any !== "function") {
  AS.any = (signals: AbortSignal[]) => {
    const c = new AbortController();
    for (const s of signals) {
      if (s.aborted) {
        c.abort(s.reason);
        break;
      }
      s.addEventListener("abort", () => c.abort(s.reason), { once: true });
    }
    return c.signal;
  };
}
