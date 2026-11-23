/**
 * Tuya bulutidan olingan qurilmalar ro'yxati (local key va DP bilan) — faqat XOTIRADA,
 * 30 daqiqa. Stollarni birin-ketin ulaganda Access ID / Secret ni har safar qayta
 * kiritish shart bo'lmasin: tarmoqda topilgan qurilma tanlansa kalit va DP o'zi to'ladi.
 * Diskka, localStorage ga yoki serverga yozilmaydi; Access Secret umuman saqlanmaydi.
 */
import type { TuyaCloudDevice } from '../../../offline/desktop';

const TTL_MS = 30 * 60 * 1000;

let cache: { at: number; devices: TuyaCloudDevice[] } | null = null;

export const getTuyaCloudCache = (now = Date.now()): TuyaCloudDevice[] | null =>
  cache && now - cache.at < TTL_MS ? cache.devices : null;

export const setTuyaCloudCache = (devices: readonly TuyaCloudDevice[], now = Date.now()): void => {
  cache = { at: now, devices: [...devices] };
};

export const clearTuyaCloudCache = (): void => {
  cache = null;
};

/** Ro'yxatdan qurilma (ID kichik-katta harfga qaramay) yoki null */
export const cachedTuyaDevice = (deviceId: string | undefined, now = Date.now()): TuyaCloudDevice | null => {
  const id = deviceId?.trim().toLowerCase();
  if (!id) return null;
  return getTuyaCloudCache(now)?.find((device) => device.id.trim().toLowerCase() === id) ?? null;
};

/** Bulut bergan DP yaroqli bo'lsa — o'sha, aks holda null */
export const cloudDp = (device: TuyaCloudDevice | null | undefined): number | null =>
  typeof device?.switchDp === 'number' && Number.isInteger(device.switchDp) && device.switchDp >= 1 && device.switchDp <= 255
    ? device.switchDp
    : null;
