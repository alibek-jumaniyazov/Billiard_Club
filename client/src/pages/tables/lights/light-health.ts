import type { LightMode, TableLightConfig } from '../../../types';
import { draftConfig, driverFields, isBridgeOnly, toDraft, type TableDraft } from './shared';

export type LightHealth = 'unconfigured' | 'disabled' | 'offline' | 'error' | 'stale' | 'pending' | 'unconfirmed' | 'confirmed';

/** A successful command is not evidence that a relay reported its state. */
export function lightHealth(row: TableLightConfig, mode: LightMode, bridgeOnline: boolean, forceSyncSec: number, now: number): LightHealth {
  if (row.driver === 'none') return 'unconfigured';
  if (mode === 'off' || !row.isActive) return 'disabled';
  if (row.error || (mode === 'direct' && isBridgeOnly(row.driver))) return 'error';
  if (mode === 'bridge' && !bridgeOnline) return 'offline';
  if (!row.syncedAt) return 'pending';
  const stamp = Date.parse(row.syncedAt);
  if (!Number.isFinite(stamp) || now - stamp > Math.max(90, forceSyncSec * 2 + 30) * 1000) return 'stale';
  if (row.state === null) return 'unconfirmed';
  if (typeof row.desired === 'boolean' && row.state !== row.desired) return 'pending';
  return 'confirmed';
}

export const needsLightAttention = (health: LightHealth): boolean =>
  ['offline', 'error', 'stale', 'pending', 'unconfirmed'].includes(health);

const canonical = (draft: TableDraft) => JSON.stringify({
  driver: draft.driver, host: draft.host.trim(), channel: draft.channel,
  inverted: draft.inverted, onUrl: draft.onUrl.trim(), offUrl: draft.offUrl.trim(),
  config: draftConfig(draft),
});

export function hasLightChanges(row: TableLightConfig, draft: TableDraft): boolean {
  // Preserve invalid channel edits as dirty, even when their parsed form is empty.
  return !!draft.auth.trim() || canonical(toDraft(row)) !== canonical(draft)
    || (draft.channelsText.trim() !== toDraft(row).channelsText && !!lightDraftIssue(draft));
}

export type LightDraftIssue = 'host' | 'channel' | 'channels' | 'urls' | 'entity' | 'topic' | 'port' | 'bytes' | 'serial';

/** Stop incomplete/ambiguous device settings before they can replace a working relay. */
export function lightDraftIssue(draft: TableDraft): LightDraftIssue | null {
  if (draft.driver === 'none') return null;
  const fields = driverFields(draft.driver);
  if (fields.host && !draft.host.trim()) return 'host';
  if (!Number.isInteger(draft.channel) || draft.channel < 0 || draft.channel > 32) return 'channel';
  const channels = draft.channelsText.trim().split(/[\s,;]+/).filter(Boolean);
  if (channels.length > 8 || channels.some((s) => !/^\d+$/.test(s) || Number(s) > 32)) return 'channels';
  if (fields.urls && (!validTemplate(draft.onUrl) || !validTemplate(draft.offUrl))) return 'urls';
  if (fields.entity && !draft.config.entity?.trim()) return 'entity';
  if (fields.entityId && !/^(switch|light)\.[a-z0-9_]+$/.test(draft.config.entityId?.trim() ?? '')) return 'entity';
  if (fields.mqtt && (!draft.config.topic?.trim() || [draft.config.topic, draft.config.stateTopic].some((s) => s && /[#+\u0000]/.test(s)))) return 'topic';
  if (draft.driver === 'tcp' && !/:\d+$/.test(draft.host.trim())) return 'port';
  if (fields.serial && !draft.config.serialPort?.trim()) return 'serial';
  if (fields.raw) {
    const validHex = (s?: string) => !!s && /^(?:[a-f\d]{2})+$/i.test(s.replace(/[\s:-]/g, ''));
    const validBytes = (hex?: string, ascii?: string) => hex?.trim() ? validHex(hex) : !!ascii?.trim();
    if (!validBytes(draft.config.onHex, draft.config.onAscii) || !validBytes(draft.config.offHex, draft.config.offAscii)
      || (draft.config.expectHex && !validHex(draft.config.expectHex))) return 'bytes';
  }
  return null;
}

function validTemplate(value: string): boolean {
  try {
    const url = new URL(value.trim().replaceAll('{channel}', '0'));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
