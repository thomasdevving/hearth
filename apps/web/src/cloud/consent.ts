// Cloud consent hooks. M7 fills these in (anonymous sign-in, App Check, Remote Config).
export async function onConsentChanged(_on: boolean): Promise<void> {}
export async function deleteCloudData(): Promise<void> {}
