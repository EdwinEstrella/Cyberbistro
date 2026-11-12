export const SERVICE_ALERT_SOUND_URL =
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav";

/**
 * Plays the notification sound for new service requests.
 * Completely safe in SSR and test environments, never throws.
 */
export function playServiceAlertSound(url: string = SERVICE_ALERT_SOUND_URL): void {
  try {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return;
    }
    const audio = new Audio(url);
    audio.volume = 0.5;
    void audio.play().catch(() => {});
  } catch {
    // Defensively swallow any playback or environment errors
  }
}
