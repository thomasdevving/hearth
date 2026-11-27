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
    // Turning consent off stops all cloud use (every path checks it) but keeps the anonymous
    // sign-in, so "Delete everything" can still reach and remove what was uploaded.
    if (on) {
      await startCloud();
      await syncWeeks();
    }
    return null;
  } catch (e) {
    console.warn("cloud", e);
    const code = (e as { code?: string }).code ?? "";
    return on
      ? `Could not connect to the cloud${code ? ` (${code})` : ""}. Your choice is saved; Hearth keeps working on this device and tries again later.`
      : null;
  }
}

/** Returns false when the cloud copy could not be deleted (for example offline). */
export async function deleteCloudData(): Promise<boolean> {
  try {
    await deleteCloud();
    await stopCloud();
    return true;
  } catch (e) {
    console.warn("cloud delete", e);
    return false;
  }
}
