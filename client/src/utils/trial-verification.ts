import type { TrialVerificationChallenge, TrialVerificationStatus } from '../api';

/** Only a live, server-confirmed contact may become a registration payload. */
export const readTrialProof = (
  challenge: TrialVerificationChallenge | null,
  verification: TrialVerificationStatus,
  now = Date.now(),
): { id: string; token: string; phone: string } | null => {
  if (!challenge || verification.status !== 'verified') return null;
  const expiresAt = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !/^\d{7,15}$/.test(verification.phone)) {
    return null;
  }
  return { id: challenge.id, token: challenge.token, phone: `+${verification.phone}` };
};

/** Focus + visibility can fire together. Share one request and reject stale replies. */
export class TrialRequestGate {
  private version = 0;
  private active: number | null = null;
  private lastCheckAt = -Infinity;

  begin(kind: 'start' | 'check', now = Date.now()): number | null {
    if (this.active !== null || (kind === 'check' && now - this.lastCheckAt < 4_000)) {
      return null;
    }
    if (kind === 'check') this.lastCheckAt = now;
    this.active = ++this.version;
    return this.active;
  }

  isCurrent(ticket: number): boolean {
    return this.active === ticket && this.version === ticket;
  }

  finish(ticket: number): void {
    if (this.isCurrent(ticket)) this.active = null;
  }

  invalidate(): void {
    this.version += 1;
    this.active = null;
    this.lastCheckAt = -Infinity;
  }
}
