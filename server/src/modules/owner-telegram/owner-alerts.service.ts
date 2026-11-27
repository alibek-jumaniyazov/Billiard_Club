import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditEntry, AuditService } from '../../common/audit/audit.service';
import { BotLang, formatLocalTime } from './owner-telegram.format';
import {
  AlertContext,
  renderCancelAlert,
  renderDebtWriteoffAlert,
  renderDiscountAlert,
  renderOrderCancelAlert,
  renderPriceAlert,
  renderShiftClosedAlert,
  renderShiftOpenAlert,
  renderStockAlert,
} from './owner-report.render';
import { OwnerReportService } from './owner-report.service';
import { AlertKey, OwnerTelegramService } from './owner-telegram.service';

/** Audit jurnali hodisasi -> egaga darhol xabar turi */
export const ACTION_ALERTS: Readonly<Record<string, AlertKey>> = {
  'session.cancel': 'cancel',
  'order.cancel': 'cancel',
  'session.discount': 'discount',
  'order.discount': 'discount',
  'session.adjust': 'discount',
  'shift.open': 'shift',
  'shift.close': 'shift',
  'debt.writeoff': 'debt',
  'product.price': 'prices',
  'table.price': 'prices',
  'product.stock': 'stock',
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

interface ShiftRow {
  openedAt: Date | null;
  closedAt: Date | null;
  openingCash: string | null;
  expectedCash: string | null;
  countedCash: string | null;
  difference: string | null;
  cashOut: string | null;
  closingNote: string | null;
  summary: {
    sessionsCount?: number;
    collected?: number;
    byMethod?: { cash?: number; card?: number; transfer?: number };
    debtsCreated?: number;
    expenses?: number;
    discounts?: number;
  } | null;
}

/**
 * DARHOL XABARLAR: pul bilan bog'liq muhim amallar (o'yinni bekor qilish, chegirma,
 * smena yopilishi va kassa farqi, qarzni hisobdan chiqarish, narx o'zgarishi) audit
 * jurnaliga yoziladi — shu yerdan egasining Telegramiga ketadi. Biznes oqimi
 * bunga bog'liq emas: xabar xatosi kassani hech qachon to'xtatmaydi.
 */
@Injectable()
export class OwnerAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerAlertsService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly audit: AuditService,
    private readonly telegram: OwnerTelegramService,
    private readonly reports: OwnerReportService,
    private readonly db: DataSource,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.audit.subscribe(async (entry) => {
      await this.onAudit(entry);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  /** @returns xabar navbatga qo'yilgan chatlar soni */
  async onAudit(entry: AuditEntry): Promise<number> {
    const alert = ACTION_ALERTS[entry.action];
    if (!alert || !entry.clubId || !this.telegram.botConfig) return 0;
    try {
      const render = await this.buildRender(entry);
      if (!render) return 0;
      return await this.telegram.notifyClub(entry.clubId, alert, render, { actorUserId: entry.userId ?? null });
    } catch (err) {
      this.logger.error(`Darhol xabar tayyorlanmadi (${entry.action}): ${(err as Error).message}`);
      return 0;
    }
  }

  private async buildRender(entry: AuditEntry): Promise<((lang: BotLang) => string) | null> {
    const clubId = entry.clubId as number;
    const ctx = await this.reports.clubContext(clubId);
    if (!ctx) return null;
    const meta = entry.meta ?? {};
    const actorRows = entry.userId
      ? ((await this.db.query(`SELECT name, role FROM users WHERE id = $1`, [entry.userId])) as Array<{ name: string; role: string }>)
      : [];
    const base: AlertContext = {
      club: ctx.info.name,
      currency: ctx.info.currency,
      actor: actorRows[0]?.name ?? null,
      actorRole: entry.actorRole ?? actorRows[0]?.role ?? null,
      table: null,
      time: formatLocalTime(ctx.tz, new Date()),
    };

    switch (entry.action) {
      case 'session.cancel': {
        const table = await this.tableOfSession(clubId, entry.entityId);
        const input = {
          tableAmount: num(meta.tableAmount),
          barAmount: num(meta.barAmount),
          durationSeconds: num(meta.durationSeconds),
          reason: str(meta.reason),
          offline: Boolean(meta.offline),
        };
        return (lang) => renderCancelAlert({ ...base, table }, input, lang);
      }
      case 'order.cancel': {
        const table =
          (await this.tableById(clubId, num(meta.tableId) || null)) ??
          (await this.tableOfSession(clubId, num(meta.sessionId) || null));
        const input = { totalAmount: num(meta.totalAmount), itemCount: num(meta.itemCount), reason: str(meta.reason) };
        if (input.totalAmount <= 0) return null;
        return (lang) => renderOrderCancelAlert({ ...base, table }, input, lang);
      }
      case 'order.discount': {
        // Stolsiz bar savdosidagi chegirma — stol yo'q, joy sifatida "Bar" ko'rsatiladi
        const amount = num(meta.discount);
        if (amount === 0) return null;
        const input = {
          amount,
          totalAmount: meta.totalAmount === undefined ? null : num(meta.totalAmount),
          reason: null,
          kind: 'discount' as const,
        };
        return (lang) =>
          renderDiscountAlert({ ...base, table: lang === 'ru' ? 'Бар (без стола)' : 'Bar (stolsiz)' }, input, lang);
      }
      case 'session.discount':
      case 'session.adjust': {
        const discount = entry.action === 'session.discount';
        const amount = discount ? num(meta.discount) : num(meta.adjustmentAmount);
        if (amount === 0) return null;
        const table = await this.tableOfSession(clubId, entry.entityId);
        const input = {
          amount,
          totalAmount: meta.totalAmount === undefined ? null : num(meta.totalAmount),
          reason: str(discount ? meta.reason : meta.adjustmentReason),
          kind: discount ? ('discount' as const) : ('adjust' as const),
        };
        return (lang) => renderDiscountAlert({ ...base, table }, input, lang);
      }
      case 'shift.open': {
        const openingCash = num(meta.openingCash);
        return (lang) => renderShiftOpenAlert(base, { openingCash }, lang);
      }
      case 'shift.close': {
        const rows = (await this.db.query(
          `SELECT "openedAt", "closedAt", "openingCash", "expectedCash", "countedCash", difference, "cashOut",
                  "closingNote", summary
           FROM cash_shifts WHERE id = $1 AND "clubId" = $2`,
          [entry.entityId, clubId],
        )) as ShiftRow[];
        const shift = rows[0];
        if (!shift) return null;
        const summary = shift.summary ?? {};
        const nullable = (value: string | null) => (value === null ? null : num(value));
        const input = {
          openedAt: shift.openedAt ? new Date(shift.openedAt).toISOString() : null,
          closedAt: shift.closedAt ? new Date(shift.closedAt).toISOString() : null,
          openingCash: num(shift.openingCash),
          expectedCash: nullable(shift.expectedCash),
          countedCash: nullable(shift.countedCash),
          difference: nullable(shift.difference),
          cashOut: nullable(shift.cashOut),
          sessionsCount: num(summary.sessionsCount),
          collected: num(summary.collected),
          byMethod: {
            cash: num(summary.byMethod?.cash),
            card: num(summary.byMethod?.card),
            transfer: num(summary.byMethod?.transfer),
          },
          debtsCreated: num(summary.debtsCreated),
          expenses: num(summary.expenses),
          discounts: num(summary.discounts),
          note: str(shift.closingNote),
        };
        return (lang) => renderShiftClosedAlert(base, input, lang, ctx.tz);
      }
      case 'debt.writeoff': {
        const input = {
          amount: num(meta.remainingDebt) || num(meta.totalDebt),
          customer: str(meta.customerName),
          reason: str(meta.reason),
        };
        if (input.amount <= 0) return null;
        return (lang) => renderDebtWriteoffAlert(base, input, lang);
      }
      case 'product.price':
      case 'table.price': {
        const oldPrice = num(meta.oldPrice);
        const newPrice = num(meta.newPrice);
        if (oldPrice === newPrice) return null;
        const perHour = entry.action === 'table.price';
        const subject = perHour
          ? (await this.tableById(clubId, entry.entityId ?? null)) ?? '—'
          : str(meta.name) ?? '—';
        return (lang) => renderPriceAlert(base, { subject, oldPrice, newPrice, perHour }, lang);
      }
      case 'product.stock': {
        const delta = num(meta.delta);
        if (delta === 0) return null;
        const rows = (await this.db.query(`SELECT name FROM products WHERE id = $1 AND "clubId" = $2`, [
          entry.entityId,
          clubId,
        ])) as Array<{ name: string }>;
        const input = {
          product: rows[0]?.name ?? '—',
          delta,
          after: meta.after === undefined || meta.after === null ? null : num(meta.after),
          reason: str(meta.reason),
        };
        return (lang) => renderStockAlert(base, input, lang);
      }
      default:
        return null;
    }
  }

  private async tableOfSession(clubId: number, sessionId: number | null | undefined): Promise<string | null> {
    if (!sessionId) return null;
    const rows = (await this.db.query(
      `SELECT t.name FROM sessions s JOIN tables t ON t.id = s."tableId" WHERE s.id = $1 AND s."clubId" = $2`,
      [sessionId, clubId],
    )) as Array<{ name: string }>;
    return rows[0]?.name ?? null;
  }

  private async tableById(clubId: number, tableId: number | null): Promise<string | null> {
    if (!tableId) return null;
    const rows = (await this.db.query(`SELECT name FROM tables WHERE id = $1 AND "clubId" = $2`, [tableId, clubId])) as Array<{
      name: string;
    }>;
    return rows[0]?.name ?? null;
  }
}
