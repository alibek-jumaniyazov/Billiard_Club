/**
 * Versiya yordamchilari — Android qobig'i (APK) yangilanishini aniqlash uchun.
 * Qobiq versiyasi user-agent'da: `BilliardClubAndroid/1.1.0`
 * (mobile/capacitor.config.ts: appendUserAgent).
 */

/** "1.2.3" → [1, 2, 3]; noto'g'ri qiymat → null */
const parse = (value: string): number[] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  return match ? match.slice(1, 4).map(Number) : null;
};

/** `candidate` versiyasi `current` dan YANGIMI (semver, faqat major.minor.patch) */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};

/** Android ilova ichida ochilganmi — bo'lsa APK versiyasi, aks holda null */
export const androidShellVersion = (userAgent: string = navigator.userAgent): string | null =>
  /BilliardClubAndroid\/(\d+\.\d+\.\d+)/.exec(userAgent)?.[1] ?? null;
