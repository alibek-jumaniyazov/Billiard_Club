import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { safeTimezone } from '../../modules/settings/timezones';

/**
 * "Klub kuni" yordamchilari — kun chegaralari HAR DOIM klub vaqt mintaqasida
 * (settings.timezone) hisoblanadi, server qaysi mintaqada ishlashidan qat'i nazar
 * (Docker'da UTC). Hisobotlar, xarajatlar va boshqaruv paneli ayni shu
 * funksiyalardan foydalanadi — shuning uchun "bugun" ta'rifi hamma joyda bir xil.
 */

/**
 * Intl.DateTimeFormat qurish QIMMAT amal. Bu funksiyalar boshqaruv panelida
 * bir so'rovda o'nlab marta chaqiriladi (30 kunlik grafik), shuning uchun
 * formatterlar mintaqa bo'yicha keshlanadi — chiqish qiymati aynan bir xil.
 */
const offsetFmtCache = new Map<string, Intl.DateTimeFormat>();
const dayKeyFmtCache = new Map<string, Intl.DateTimeFormat>();

const offsetFmt = (tz: string): Intl.DateTimeFormat => {
  let fmt = offsetFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    offsetFmtCache.set(tz, fmt);
  }
  return fmt;
};

/** tz mintaqasining berilgan ondagi UTC ofseti (ms) — Intl orqali, DST ham hisobga olinadi */
export const tzOffsetMs = (tz: string, at: Date): number => {
  const fmt = offsetFmt(tz);
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
};

/**
 * Klub mintaqasidagi (year, month 1-12, day) YARIM TUNining UTC onini qaytaradi.
 * Date.UTC oy/kun oshib ketishini o'zi normallaydi (13-oy -> keyingi yil yanvari,
 * 0-kun -> oldingi oyning oxirgi kuni); ikkinchi iteratsiya DST o'tish kunlarida
 * ham to'g'ri ofset beradi.
 */
export const zonedMidnight = (tz: string, year: number, month: number, day: number): Date => {
  const wallClock = Date.UTC(year, month - 1, day);
  let ts = wallClock;
  for (let i = 0; i < 2; i++) {
    ts = wallClock - tzOffsetMs(tz, new Date(ts));
  }
  return new Date(ts);
};

/** Berilgan onning klub mintaqasidagi 'YYYY-MM-DD' kun kaliti */
export const localDayKey = (tz: string, at: Date): string => {
  let fmt = dayKeyFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFmtCache.set(tz, fmt);
  }
  return fmt.format(at);
};

/** Berilgan onning klub mintaqasidagi sana komponentlari */
export const localDateParts = (
  tz: string,
  at: Date,
): { year: number; month: number; day: number } => {
  const [year, month, day] = localDayKey(tz, at).split('-').map(Number);
  return { year, month, day };
};

/**
 * 'YYYY-MM-DD' ni sana komponentlariga (yil/oy/kun) o'qiydi.
 * new Date('YYYY-MM-DD') UTC yarim tun deb o'qiydi — kun surilib ketardi;
 * komponentlab o'qib, chegara KLUB vaqt mintaqasida hisoblanadi.
 */
export const parseDateParts = (value: string): { year: number; month: number; day: number } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new BadRequestException({ key: 'reports.invalidRange' });
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

/** Klub vaqt mintaqasi (settings.timezone) — kun chegaralari shu mintaqada hisoblanadi */
export const clubTimezone = async (dataSource: DataSource, clubId: number): Promise<string> => {
  const rows = await dataSource.query(`SELECT s.timezone FROM settings s WHERE s."clubId" = $1`, [
    clubId,
  ]);
  return safeTimezone(rows[0]?.timezone);
};
