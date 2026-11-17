import { startCloud, stopCloud } from "./client";
import { deleteCloud, syncWeeks } from "./sync";
import { cloudConfigured } from "../firebase";

/** Turning consent on starts the cloud services and queues pending weeks; off signs out. */
export async function onConsentChanged(on: boolean): Promise<void> {
  if (!cloudConfigured) return;
  try {
    if (on) {
      await startCloud();
      await syncWeeks();
    } else await stopCloud();
  } catch (e) {
    console.warn("cloud", e);
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
