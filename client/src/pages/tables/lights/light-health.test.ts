import { describe, expect, it } from 'vitest';
import type { TableLightConfig } from '../../../types';
import { hasLightChanges, lightDraftIssue, lightHealth, needsLightAttention } from './light-health';
import { toDraft } from './shared';

const now = Date.parse('2026-10-12T12:00:00Z');
const row: TableLightConfig = {
  tableId: 1, tableNumber: 1, tableName: 'VIP', isActive: true, driver: 'shelly_gen2',
  host: '192.168.1.51', channel: 0, inverted: false, hasAuth: true, onUrl: null, offUrl: null,
  config: null, overrideOn: null, overrideUntil: null, state: true,
  syncedAt: '2026-10-12T11:59:50Z', error: null, desired: true,
};
const health = (patch: Partial<TableLightConfig> = {}, online = true) =>
  lightHealth({ ...row, ...patch }, 'bridge', online, 60, now);

describe('light connection evidence', () => {
  it('never treats accepted commands without readback as confirmed', () => {
    expect(health({ state: null })).toBe('unconfirmed');
    expect(needsLightAttention(health({ state: null }))).toBe(true);
  });
  it('needs a fresh matching device response to show confirmation', () => {
    expect(health()).toBe('confirmed');
    expect(health({ state: false })).toBe('pending');
    expect(health({ syncedAt: null })).toBe('pending');
    expect(health({ syncedAt: '2026-10-12T11:00:00Z' })).toBe('stale');
    expect(health({ syncedAt: 'not-a-date' })).toBe('stale');
  });
  it('does not show an offline or failed relay as healthy based on a previous response', () => {
    expect(health({}, false)).toBe('offline');
    expect(health({ error: 'Readback mismatch' })).toBe('error');
  });
  it('handles disabled and unconfigured tables separately from failures', () => {
    expect(health({ driver: 'none' })).toBe('unconfigured');
    expect(health({ isActive: false })).toBe('disabled');
    expect(lightHealth(row, 'off', true, 60, now)).toBe('disabled');
    expect(lightHealth({ ...row, driver: 'mqtt' }, 'direct', true, 60, now)).toBe('error');
  });
});

describe('safe relay settings drafts', () => {
  it('only enables new saved targets after edits are saved', () => {
    expect(hasLightChanges(row, toDraft(row))).toBe(false);
    expect(hasLightChanges(row, { ...toDraft(row), host: '192.168.1.52' })).toBe(true);
    expect(hasLightChanges(row, { ...toDraft(row), auth: 'new secret' })).toBe(true);
    expect(hasLightChanges(row, { ...toDraft(row), host: ' 192.168.1.51 ' })).toBe(false);
  });
  it('does not silently discard invalid relay channel entries', () => {
    const draft = { ...toDraft(row), channelsText: '1, invalid, 33' };
    expect(hasLightChanges(row, draft)).toBe(true);
    expect(lightDraftIssue(draft)).toBe('channels');
    expect(lightDraftIssue({ ...draft, channelsText: '0, 1; 2' })).toBe(null);
    expect(lightDraftIssue({ ...draft, channel: 0.5 })).toBe('channel');
  });
  it('requires both HTTP commands and keeps secrets out of command URLs', () => {
    const draft = { ...toDraft(row), driver: 'http' as const, onUrl: 'http://192.168.1.51/relay/{channel}?turn=on', offUrl: '' };
    expect(lightDraftIssue(draft)).toBe('urls');
    expect(lightDraftIssue({ ...draft, offUrl: 'http://192.168.1.51/off' })).toBe(null);
    expect(lightDraftIssue({ ...draft, offUrl: 'http://admin:secret@192.168.1.51/off' })).toBe('urls');
  });
  it('requires explicit raw relay commands and a TCP port', () => {
    const draft = { ...toDraft(row), driver: 'tcp' as const, config: { onHex: 'A0 01 01 A2', offHex: 'A0 01 00 A1' } };
    expect(lightDraftIssue(draft)).toBe('port');
    expect(lightDraftIssue({ ...draft, host: '192.168.1.51:8080' })).toBe(null);
    expect(lightDraftIssue({ ...draft, host: '192.168.1.51:8080', config: { ...draft.config, offHex: 'A0 1' } })).toBe('bytes');
  });
  it('prevents ambiguous MQTT subscriptions and requires device identity', () => {
    expect(lightDraftIssue({ ...toDraft(row), driver: 'mqtt', config: { topic: 'club/+/set' } })).toBe('topic');
    expect(lightDraftIssue({ ...toDraft(row), driver: 'mqtt', config: { topic: 'club/1/set', stateTopic: 'club/#' } })).toBe('topic');
    expect(lightDraftIssue({ ...toDraft(row), driver: 'home_assistant', config: {} })).toBe('entity');
    expect(lightDraftIssue({ ...toDraft(row), driver: 'home_assistant', config: { entityId: 'switch.table_1' } })).toBe(null);
  });
});
