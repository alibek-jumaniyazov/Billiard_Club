/** Expiry of confirmed relay feedback; a heartbeat alone cannot refresh it. */
export function lightFreshUntil(input: {
  syncedAt: Date | string | null; state: boolean | null; error: string | null;
  mode: string; forceSyncSec: number; bridgeSeenAt: Date | string | null;
  bridgeActive: boolean; now?: number;
}): string | null {
  if (input.mode === 'off' || input.state === null || input.error || !input.syncedAt) return null;
  const now = input.now ?? Date.now();
  const stamp = new Date(input.syncedAt).getTime();
  if (!Number.isFinite(stamp) || stamp > now + 30_000) return null;
  let until = stamp + Math.max(90, input.forceSyncSec * 2 + 30) * 1000;
  if (input.mode === 'bridge') {
    if (!input.bridgeActive || !input.bridgeSeenAt) return null;
    const seen = new Date(input.bridgeSeenAt).getTime();
    if (!Number.isFinite(seen) || seen > now + 30_000) return null;
    until = Math.min(until, seen + 60_000);
  }
  return Number.isFinite(until) && until > now ? new Date(until).toISOString() : null;
}
