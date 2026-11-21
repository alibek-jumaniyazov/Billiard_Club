import { BadRequestException } from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * OFLAYN VAQT MUHRI (`offlineAt`) — qarz to'lovi, bron, mijoz va smena
 * amallari uchun UMUMIY qoidalar.
 *
 * NEGA KERAK: klientning oflayn navbati amalni aloqa tiklangandan keyin
 * (soatlab kechikib) yuboradi. Server vaqtni o'zi qo'ysa, internetsiz paytda
 * olingan qarz to'lovi "hozir" bo'lib yozilardi — u boshqa smenaga va boshqa
 * kunning hisobotiga tushib, ikkala smenada ham soxta kamomad/ortiqcha
 * ko'rsatardi. `offlineAt` — tugma HAQIQATDA bosilgan payt (klientda server
 * soatiga moslangan).
 *
 * ISHONCH CHEGARASI: qiymat klientdan keladi, shuning uchun:
 *  - format DTO da tekshiriladi (`OfflineStampDto`);
 *  - oraliq SERVISDA tekshiriladi (`resolveOfflineAt`) — aniq, tarjima
 *    qilingan xabar bilan rad etiladi, chunki DTO xatosi klientga faqat umumiy
 *    "Validatsiya xatosi" bo'lib boradi va kassir nima qilishni bilmasdi:
 *      · kelajakda (kichik chidamlilikdan ko'p) — qurilma soati noto'g'ri;
 *      · 26 soatdan eski — oflayn ruxsatnoma 24 soat (license.ts) + navbat
 *        yetib kelishi uchun 2 soat zaxira; undan eskisi xato yoki
 *        suiiste'mol belgisi.
 *  - chidamlilik ichidagi kelajak vaqti HOZIRGI vaqtga, pastki chegaradan
 *    (masalan smena ochilgan paytdan) oldingisi chegaraga KESILADI va
 *    `clamped` belgisi qaytadi — chaqiruvchi buni audit jurnaliga yozadi.
 *
 * Sessiyalar moduli o'z `clampOfflineAt` ini ishlatadi (u o'yinni rad etmaydi,
 * faqat kesadi) — bu yerdagi qoida pul/hujjat amallari uchun qat'iyroq.
 */

/** Klient soati server soatidan shuncha oldinda bo'lishi mumkin (sinxron xatosi) */
export const OFFLINE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Eng eski qabul qilinadigan muhr: 24 soatlik oflayn ruxsatnoma + 2 soat zaxira */
export const OFFLINE_MAX_AGE_MS = 26 * 60 * 60 * 1000;

/** DTO bazasi: `offlineAt` ixtiyoriy, faqat to'liq ISO-8601 format qabul qilinadi */
export class OfflineStampDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  offlineAt?: string;
}

export interface OfflineMoment {
  /** Biznes vaqti: oflayn muhr (chegaralangan) yoki hozirgi server vaqti */
  at: Date;
  /** So'rov oflayn navbatdan kelganmi (`offlineAt` berilgan) */
  offline: boolean;
  /** Muhr chegaraga keltirildimi (pastki chegara yoki kichik kelajak farqi) */
  clamped: boolean;
}

/**
 * `offlineAt` ni biznes vaqtiga aylantiradi.
 *
 * @param floor pastki chegara (masalan smena ochilgan payt yoki qarz yozilgan
 *   payt) — amal o'zi bog'liq bo'lgan hodisadan OLDIN yozila olmaydi
 * @throws BadRequestException — kelajakda yoki juda eski muhr
 */
export const resolveOfflineAt = (
  raw: string | undefined | null,
  floor?: Date | null,
  now: Date = new Date(),
): OfflineMoment => {
  if (raw === undefined || raw === null) return { at: now, offline: false, clamped: false };

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new BadRequestException({ key: 'common.validationError' });
  const nowMs = now.getTime();
  if (ms > nowMs + OFFLINE_FUTURE_TOLERANCE_MS) {
    throw new BadRequestException({ key: 'offline.timeInFuture' });
  }
  if (ms < nowMs - OFFLINE_MAX_AGE_MS) {
    throw new BadRequestException({ key: 'offline.timeTooOld' });
  }

  const floorMs = floor ? new Date(floor).getTime() : Number.NEGATIVE_INFINITY;
  const applied = Math.min(Math.max(ms, floorMs), nowMs);
  return { at: new Date(applied), offline: true, clamped: applied !== ms };
};
