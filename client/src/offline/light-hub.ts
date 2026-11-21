/**
 * CHIROQ MARKAZI BILAN ALOQA — kassa ekranidagi stollar holatini kompyuterdagi
 * chiroq markaziga uzatadi (desktop/lights.js -> bridge/lib/hub.js).
 *
 * NEGA: internet uzilganda o'yin boshlanishi/tugashi serverga yetmaydi, bulut
 * ham chiroq agentiga xabar bera olmaydi. Markaz esa shu kompyuterning o'zida —
 * kassir ko'rib turgan holatni (navbatdagi amallar bilan birga) bevosita oladi
 * va relelarni lokal tarmoq orqali boshqaradi.
 *
 * `pending` — amal kassada navbatda, serverga hali yetmagan. Markaz bunday
 * amalni server uni tasdiqlaguncha ustun qo'yadi: aks holda internet qaytgan
 * zahoti (navbat hali yuborilmay turib) eski bulut holati o'ynayotgan stol
 * chirog'ini o'chirib qo'yardi.
 */

import type { BilliardTable } from '../types';
import type { QueueEntry } from './queue';
import type { LightHubStatus, LightHubTableStatus, LightHubView, LightHubViewTable } from './desktop';

/** Chiroq holatiga ta'sir qiladigan navbat amallari */
const SESSION_KINDS = new Set(['session.start', 'session.pause', 'session.resume', 'session.end',
  'session.cancel', 'session.transfer']);

const toMs = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/**
 * Kassa ko'rinishidan markaz uchun holat yig'adi.
 *
 * @param tables   EKRANDAGI stollar (server holati + oflayn navbat qoplamasi)
 * @param entries  oflayn navbat
 * @param fetchedAt stollar serverdan OXIRGI marta olingan vaqt (server soati, ms);
 *                  keshdan ko'rsatilgan bo'lsa — keshning asl vaqti
 * @param serverNow kassaning server soati bo'yicha hozirgi vaqti (ms)
 */
export const buildLightHubView = (
  tables: BilliardTable[],
  entries: QueueEntry[],
  fetchedAt: number | null,
  serverNow: number,
): LightHubView => {
  // Har stol uchun navbatdagi ENG OXIRGI o'yin amali
  const pending = new Map<number, { at: number; kind: string }>();
  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    const meta = (entry.meta ?? {}) as Record<string, unknown>;
    const kind = typeof meta.kind === 'string' ? meta.kind : '';
    if (!SESSION_KINDS.has(kind)) continue;
    const at = toMs(meta.at) ?? toMs(meta.startTime) ?? entry.createdAt;
    for (const raw of [meta.tableId, meta.toTableId]) {
      const tableId = Number(raw);
      if (!Number.isInteger(tableId) || tableId <= 0) continue;
      const previous = pending.get(tableId);
      if (!previous || at >= previous.at) pending.set(tableId, { at, kind });
    }
  }

  const list: LightHubViewTable[] = tables.map((table) => {
    const session = table.sessions?.[0] ?? null;
    const status: LightHubViewTable['session'] = session
      ? session.status === 'paused' ? 'paused' : 'active'
      : null;
    const queued = pending.get(table.id);
    const since = queued
      ? queued.at
      : session
        ? toMs(session.status === 'paused' ? session.pausedAt : session.startTime)
        : null;
    return {
      tableId: table.id,
      session: status,
      since: iso(since),
      pending: Boolean(queued),
      endedAt: queued && status === null ? iso(queued.at) : null,
    };
  });

  return { fetchedAt, serverNow, tables: list };
};

/** Markazdagi stol holati (bo'lsa) */
export const hubTableStatus = (status: LightHubStatus | null, tableId: number): LightHubTableStatus | null =>
  status?.hub?.tables.find((item) => item.tableId === tableId) ?? null;

/** Markaz ishlayaptimi va relelarga tegyaptimi (token bekor qilinmagan) */
export const hubControlling = (status: LightHubStatus | null): boolean =>
  Boolean(status?.running && status.hub && !status.hub.cloud.authFailed);

/**
 * Stollar ro'yxatiga markazning JONLI holatini qo'shadi (kartadagi chiroq tugmasi
 * uchun). Markaz relelarni o'zi boshqarayotgani uchun uning natijasi serverdagi
 * nusxadan yangiroq — ayniqsa internetsiz paytda (server umuman bilmaydi).
 */
export const withHubLightState = (
  tables: BilliardTable[],
  status: LightHubStatus | null,
  nowMs: number,
): BilliardTable[] => {
  if (!hubControlling(status)) return tables;
  const byId = new Map((status?.hub?.tables ?? []).map((item) => [item.tableId, item]));
  if (!byId.size) return tables;
  return tables.map((table) => {
    const hub = byId.get(table.id);
    if (!hub) return table;
    const confirmed = hub.ok === true ? (hub.actual ?? hub.desired) : null;
    return {
      ...table,
      lightControl: true,
      lightState: hub.ok === false ? null : confirmed,
      lightError: hub.ok === false ? hub.error || 'xato' : hub.authMissing ? 'parol saqlanmagan' : null,
      // Markaz har o'zgarishda va majburiy sinxronizatsiyada yangilaydi
      lightFreshUntil: hub.ok === null ? null : new Date(nowMs + 90_000).toISOString(),
    };
  });
};
