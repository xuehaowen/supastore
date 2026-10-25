import { updateStoreSettings } from "./update-store-settings";
export function pauseStore(input: {
  staffUserId: string;
  isPaused: boolean;
  pauseMessage?: string;
}) {
  return updateStoreSettings(input);
}
