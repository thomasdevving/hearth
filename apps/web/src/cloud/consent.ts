import { startCloud, stopCloud } from "./client";
import { deleteCloud, syncWeeks } from "./sync";
import { cloudConfigured } from "../firebase";

/**
 * Turning consent on starts the cloud services and queues pending weeks; off signs out.
 * Returns a sentence for the user when the cloud could not be reached, else null.
 */
export async function onConsentChanged(on: boolean): Promise<string | null> {
  if (!cloudConfigured) return null;
  try {
    if (on) {
      await startCloud();
      await syncWeeks();
    } else await stopCloud();
    return null;
  } catch (e) {
    console.warn("cloud", e);
    const code = (e as { code?: string }).code ?? "";
    return on
      ? `Could not connect to the cloud${code ? ` (${code})` : ""}. Your choice is saved; Hearth keeps working on this device and tries again later.`
      : null;
  }
}

export async function deleteCloudData(): Promise<void> {
  try {
    await deleteCloud();
    await stopCloud();
  } catch (e) {
    console.warn("cloud delete", e);
  }
}
