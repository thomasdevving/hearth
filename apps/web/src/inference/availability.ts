// On-device availability through Chrome's Prompt API, which Firebase AI Logic uses on web.
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import { firebaseApp } from "../firebase";
import { setModelStatus, type OnDeviceState } from "./status";

export const CREATE_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

interface LanguageModelApi {
  availability(opts?: object): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
}
function lm(): LanguageModelApi | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelApi }).LanguageModel;
}

let last: OnDeviceState = "checking";
export async function checkOnDevice(): Promise<OnDeviceState> {
  const api = lm();
  if (!api) last = "no_api";
  else {
    try {
      last = await api.availability(CREATE_OPTIONS);
    } catch {
      last = "unavailable";
    }
  }
  setModelStatus({ onDevice: last });
  return last;
}
export function lastOnDeviceState(): OnDeviceState {
  return last;
}

/** Start the model download. Must be called from a click (Chrome requires a user gesture). */
export async function downloadOnDeviceModel(): Promise<void> {
  const model = getGenerativeModel(getAI(firebaseApp(), { backend: new GoogleAIBackend() }), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: CREATE_OPTIONS },
  });
  setModelStatus({ onDevice: "downloading", downloadProgress: 0 });
  await model.initializeDeviceModel((p) => setModelStatus({ downloadProgress: p }));
  await checkOnDevice();
}
