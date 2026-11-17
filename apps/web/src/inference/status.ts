// Model status shown by the time machine bar and the banner.
export type OnDeviceState = "checking" | "available" | "downloadable" | "downloading" | "unavailable" | "no_api";
export interface ModelStatus {
  onDevice: OnDeviceState;
  downloadProgress: number | null;
  last: { task: string; ranOn: "on_device" | "cloud" | "none" } | null;
  cloudConfigured: boolean;
}
let status: ModelStatus = { onDevice: "checking", downloadProgress: null, last: null, cloudConfigured: false };
const listeners = new Set<() => void>();
export function getModelStatus(): ModelStatus {
  return status;
}
export function setModelStatus(patch: Partial<ModelStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function onModelStatus(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
