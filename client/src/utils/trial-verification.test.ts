import { describe, expect, it } from 'vitest';
import { readTrialProof, TrialRequestGate } from './trial-verification';

const challenge = {
  id: 'test-challenge',
  token: 'browser-only-secret',
  telegramUrl: 'https://t.me/example_bot?start=test-challenge',
  expiresAt: '2026-10-05T10:15:00Z',
};
const now = Date.parse('2026-10-05T10:00:00Z');

describe('registration proof', () => {
  it('uses the confirmed international phone, including a 9-digit foreign number', () => {
    expect(readTrialProof(challenge, { status: 'verified', phone: '423123456' }, now)).toEqual({
      id: challenge.id, token: challenge.token, phone: '+423123456',
    });
  });

  it('requires both a challenge and a verified contact', () => {
    expect(readTrialProof(null, { status: 'verified', phone: '998900000001' }, now)).toBeNull();
    for (const status of ['pending', 'expired', 'used'] as const) {
      expect(readTrialProof(challenge, { status }, now)).toBeNull();
    }
  });

  it('blocks submission at the exact expiry boundary even before a timer fires', () => {
    expect(readTrialProof(challenge, { status: 'verified', phone: '998900000001' }, Date.parse(challenge.expiresAt))).toBeNull();
  });

  it('fails closed on malformed expiry or phone data', () => {
    expect(readTrialProof({ ...challenge, expiresAt: 'invalid' }, { status: 'verified', phone: '998900000001' }, now)).toBeNull();
    for (const phone of ['+998900000001', '998 90 000 00 01', '', '123', '1234567890123456']) {
      expect(readTrialProof(challenge, { status: 'verified', phone }, now)).toBeNull();
    }
  });
});

describe('Telegram return checks', () => {
  it('deduplicates simultaneous focus, visibility and manual checks', () => {
    const gate = new TrialRequestGate();
    const request = gate.begin('check', now)!;
    expect(gate.begin('check', now)).toBeNull();
    expect(gate.begin('check', now + 8_000)).toBeNull();
    gate.finish(request);
    expect(gate.begin('check', now + 8_000)).not.toBeNull();
  });

  it('limits completed return checks to one per four seconds', () => {
    const gate = new TrialRequestGate();
    gate.finish(gate.begin('check', now)!);
    expect(gate.begin('check', now + 3_999)).toBeNull();
    expect(gate.begin('check', now + 4_000)).not.toBeNull();
  });

  it('ignores responses from a reset or expired challenge without releasing a newer request', () => {
    const gate = new TrialRequestGate();
    const previous = gate.begin('check', now)!;
    gate.invalidate();
    const next = gate.begin('start', now + 1)!;
    expect(gate.isCurrent(previous)).toBe(false);
    gate.finish(previous);
    expect(gate.isCurrent(next)).toBe(true);
    expect(gate.begin('check', now + 5_000)).toBeNull();
  });

  it('allows a fresh contact to be checked after reset without the previous cooldown', () => {
    const gate = new TrialRequestGate();
    gate.finish(gate.begin('check', now)!);
    gate.invalidate();
    expect(gate.begin('check', now + 1)).not.toBeNull();
  });
});
