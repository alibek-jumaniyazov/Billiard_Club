import type { LightHubStatus, LightHubTableStatus } from '../../../offline/desktop';
import type { LightMode, LightsOverview } from '../../../types';
import { lightHealth, needsLightAttention, type LightHealth } from './light-health';

/**
 * HOLAT bo'limining ma'lumot qatlami: serverdagi ko'rinish (GET /lights) va
 * shu kompyuterdagi chiroq markazi holati BITTA ro'yxatga birlashtiriladi.
 *
 * Markaz shu kompyuterda ishlayotgan bo'lsa, relelarga buyruqni AYNAN u
 * beradi — shuning uchun rele javobi/xatosi uchun uning ma'lumoti yangiroq va
 * ishonchliroq. Internet yo'q bo'lsa (server ko'rinishi yo'q) ro'yxat faqat
 * markaz ma'lumotidan quriladi.
 */

export interface BoardManual {
  on: boolean;
  /** Muddat (ISO); shu kompyuterdagi qo'lda boshqaruvda noma'lum bo'lishi mumkin */
  until: string | null;
  /** Qo'lda boshqaruv shu kompyuterdan (internetsiz) berilgan */
  local: boolean;
}

export interface BoardRow {
  tableId: number;
  tableNumber: number;
  tableName: string;
  configured: boolean;
  session: 'active' | 'paused' | null;
  /** Hozir yonishi kerakmi (null — noma'lum) */
  desired: boolean | null;
  /** Ko'rsatiladigan holat: rele javobi, javob bermaydigan relelarda — yuborilgan buyruq */
  shown: boolean | null;
  manual: BoardManual | null;
  health: LightHealth;
  error: string | null;
  /** Rele paroli kompyuterda saqlanmagan — internetsiz boshqarilmaydi */
  authMissing: boolean;
}

/** Markaz shu kompyuterda ishlab, relelarni boshqarib turibdimi */
export const hubControlsHere = (status: LightHubStatus | null | undefined): boolean =>
  !!status?.enabled && !!status.running && !!status.hub && !status.hub.cloud.authFailed;

/** Markaz ma'lumotidan sog'liq holati (server `lightHealth` bilan bir xil shkala) */
export function hubTableHealth(entry: LightHubTableStatus): LightHealth {
  if (entry.authMissing || entry.error || entry.ok === false) return 'error';
  if (entry.ok === null) return 'pending';
  if (entry.actual === null) return 'unconfirmed';
  return entry.actual === entry.desired ? 'confirmed' : 'pending';
}

const shownFromHub = (entry: LightHubTableStatus): boolean | null =>
  entry.actual !== null ? entry.actual : entry.ok ? entry.desired : null;

const manualFromHub = (entry: LightHubTableStatus, serverUntil: string | null): BoardManual | null =>
  entry.source === 'override' || entry.source === 'override-local'
    ? { on: entry.desired, until: entry.source === 'override' ? serverUntil : null, local: entry.source === 'override-local' }
    : null;

export function buildBoardRows(
  data: LightsOverview | null,
  hub: LightHubStatus | null,
  now: number,
): BoardRow[] {
  const local = hubControlsHere(hub) ? new Map(hub!.hub!.tables.map((entry) => [entry.tableId, entry])) : null;

  if (data) {
    return data.tables
      .filter((row) => row.isActive)
      .map((row) => {
        const configured = row.driver !== 'none';
        const health = lightHealth(row, data.mode, data.bridge.online, data.forceSyncSec, now);
        const serverManual: BoardManual | null = row.overrideActive && typeof row.overrideOn === 'boolean'
          ? { on: row.overrideOn, until: row.overrideUntil, local: false }
          : null;
        const base: BoardRow = {
          tableId: row.tableId,
          tableNumber: row.tableNumber,
          tableName: row.tableName,
          configured,
          session: row.sessionStatus ?? null,
          desired: typeof row.desired === 'boolean' ? row.desired : null,
          shown: row.state !== null ? row.state : health === 'unconfirmed' && typeof row.desired === 'boolean' ? row.desired : null,
          manual: serverManual,
          health,
          error: row.error,
          authMissing: false,
        };
        const entry = configured && data.mode === 'bridge' ? local?.get(row.tableId) : undefined;
        if (!entry) return base;
        return {
          ...base,
          desired: entry.desired,
          shown: shownFromHub(entry),
          manual: manualFromHub(entry, row.overrideUntil),
          health: hubTableHealth(entry),
          error: entry.error,
          authMissing: entry.authMissing,
        };
      });
  }

  if (!local) return [];
  return Array.from(local.values())
    .map((entry): BoardRow => ({
      tableId: entry.tableId,
      tableNumber: entry.tableNumber ?? entry.tableId,
      tableName: entry.tableName ?? '',
      configured: true,
      session: null,
      desired: entry.desired,
      shown: shownFromHub(entry),
      manual: manualFromHub(entry, null),
      health: hubTableHealth(entry),
      error: entry.error,
      authMissing: entry.authMissing,
    }))
    .sort((a, b) => a.tableNumber - b.tableNumber);
}

export interface BoardMetrics {
  configured: number;
  total: number;
  on: number;
  attention: number;
}

export const boardMetrics = (rows: BoardRow[]): BoardMetrics => ({
  configured: rows.filter((row) => row.configured).length,
  total: rows.length,
  on: rows.filter((row) => row.configured && row.shown === true).length,
  attention: rows.filter((row) => row.configured && (row.authMissing || needsLightAttention(row.health))).length,
});

/** Chiroqlarni hozir KIM boshqaryapti — Holat bo'limidagi banner uchun */
export type LightController = 'off' | 'this-pc' | 'agent' | 'agent-offline' | 'server' | 'none';

export function lightController(mode: LightMode | null, data: LightsOverview | null, hub: LightHubStatus | null): LightController {
  if (hubControlsHere(hub)) return 'this-pc';
  if (!data || mode === null) return 'none';
  if (mode === 'off') return 'off';
  if (mode === 'direct') return 'server';
  if (data.bridge.online) return 'agent';
  return data.bridge.exists ? 'agent-offline' : 'none';
}
