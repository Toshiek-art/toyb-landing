/**
 * Beta analytics hook.
 *
 * Tracking is intentionally disabled for now.
 * To enable in future, wire this function to your analytics provider
 * and call only after explicit consent for non-essential tracking.
 */
export function track(event: string, payload?: Record<string, unknown>): void {
  void event;
  void payload;
}
