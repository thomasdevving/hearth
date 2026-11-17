import type { TaskId, VerifyContext } from "@hearth/engine";

export type TaskResult<T> =
  | { ok: true; value: T; ranOn: "on_device" | "cloud"; ledgerId: string }
  | { ok: false; reason: "no_model" | "no_consent" | "invalid_output" | "error" | "offline"; fallbackUsed: boolean; ledgerId: string };

export interface RunOptions {
  sourceText?: string; // the user's text, for quote checks (S3 tasks)
  verify?: VerifyContext;
  variantInput?: (variant: "full" | "lite") => object; // task D: input depends on the variant
  image?: { mimeType: string; data: string }; // base64, task G2 only; never stored
  onRaw?: (raw: unknown, text: string, attempt: number) => void; // evaluation only: the unverified output
}

/** docs/02 §5: the only way feature code reaches a model (rule R5). */
export interface InferenceRouter {
  run<T>(task: TaskId | "Q_classify" | "Q_phrase", input: object, opts?: RunOptions): Promise<TaskResult<T>>;
}
