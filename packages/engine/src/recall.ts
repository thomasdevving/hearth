// "What helped me last time": non-LLM fallbacks for tasks R and T (docs/05, tasks R and T).

/** The first quoted message in a note ("…", “…”, '…' or ‘…’), at least 3 characters; else null. */
export function quotedMessage(note: string): string | null {
  const m = note.match(/[“"‘']([^”"’']{3,200})[”"’']/);
  return m ? m[1].trim() : null;
}

/**
 * Task T without a model: the message the person saved, else the message quoted in their note,
 * else an empty draft for them to write. Never invents text.
 */
export function draftWithoutModel(note: string, savedMessage?: string | null): string {
  if (savedMessage && savedMessage.trim()) return savedMessage.trim();
  return quotedMessage(note) ?? "";
}
