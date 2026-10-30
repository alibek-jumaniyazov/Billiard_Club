/**
 * BREND INTRO'SI qachon ko'rsatiladi — sof qaror (sinovlanadi) va brauzerdan
 * holatni o'qish.
 *
 *  - Saytda: faqat bosh sahifaga (landing, /ru/ ham) birinchi marta kirgan
 *    mehmonga; kirgan foydalanuvchi, bo'limga havola (#narxlar) yoki boshqa
 *    sahifalar — yo'q.
 *  - Qidiruvdan (Google, Yandex…) kelgan mehmon va qidiruv/ijtimoiy tarmoq
 *    botlari intro'ni KO'RMAYDI: ular izlagan narsasini darhol ko'rsin, Google
 *    esa sahifani yopib turadigan oynani (interstitial) yoqtirmaydi.
 *  - Dasturda (Windows/Android): har ishga tushganda bir marta — haqiqiy dastur
 *    "splash"i kabi. Android'da tizim splash ekrani belgini allaqachon ko'rsatgan,
 *    shuning uchun intro tayyor belgidan davom etadi (`assembled`).
 *  - Harakatni kamaytirish tanlangan bo'lsa, avtomatlashtirilgan brauzerda
 *    (testlar) yoki shu sessiyada allaqachon ko'rsatilgan bo'lsa — yo'q.
 */
import { useSyncExternalStore } from 'react';
import { isLandingPath } from '../../seo/site';
import { isAndroidShell, isAppShell } from '../../utils/appShell';

export type IntroVariant = 'full' | 'assembled';

export interface IntroContext {
  pathname: string;
  hash: string;
  appShell: boolean;
  androidShell: boolean;
  signedIn: boolean;
  reducedMotion: boolean;
  automated: boolean;
  alreadyPlayed: boolean;
  /** Qidiruv, ijtimoiy tarmoq yoki tezlik o'lchash boti */
  bot: boolean;
  /** Qidiruv tizimidan kelgan (document.referrer) */
  fromSearch: boolean;
}

const BOT_UA = /bot|crawl|spider|slurp|mediapartners|lighthouse|pagespeed|headless|facebookexternalhit|whatsapp|preview/i;
const SEARCH_REFERRER = /^https?:\/\/([^/]+\.)?(google|yandex|bing|duckduckgo|yahoo|baidu|ecosia|brave|mail)\./i;

export const INTRO_SESSION_KEY = 'bc.intro.v1';

export const introVariant = (c: IntroContext): IntroVariant | null => {
  if (c.reducedMotion || c.automated || c.alreadyPlayed) return null;
  if (c.appShell) return c.androidShell ? 'assembled' : 'full';
  if (c.bot || c.fromSearch) return null;
  if (isLandingPath(c.pathname) && !c.hash && !c.signedIn) return 'full';
  return null;
};

const safe = <T,>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

export const readIntroContext = (): IntroContext => ({
  pathname: window.location.pathname,
  hash: window.location.hash,
  appShell: isAppShell(),
  androidShell: isAndroidShell(),
  // Token bor — ehtimol kirgan foydalanuvchi (u bosh sahifadan ish joyiga o'tadi)
  signedIn: safe(() => Boolean(localStorage.getItem('accessToken')), false),
  reducedMotion: safe(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false),
  automated: safe(() => navigator.webdriver === true, false),
  alreadyPlayed: safe(() => sessionStorage.getItem(INTRO_SESSION_KEY) === '1', false),
  bot: safe(() => BOT_UA.test(navigator.userAgent), false),
  fromSearch: safe(() => SEARCH_REFERRER.test(document.referrer), false),
});

export const markIntroPlayed = (): void => {
  safe(() => sessionStorage.setItem(INTRO_SESSION_KEY, '1'), undefined);
};

/** Shu ochilishdagi intro — bir marta hisoblanadi (intro boshlangach sessiya belgisi yoziladi) */
let planned: IntroVariant | null | undefined;
export const plannedIntro = (): IntroVariant | null => {
  if (planned === undefined) planned = introVariant(readIntroContext());
  return planned;
};

/*
 * SAHIFA QACHON CHIZILADI. Og'ir sahifa (landing, ish joyi) birinchi marta
 * chizilganda asosiy oqim yarim soniyagacha band bo'ladi — bu intro'ning
 * o'rtasida "qotish" bo'lib ko'rinardi. Shuning uchun sahifa intro ostida,
 * belgi yig'ilib HARAKATSIZ turgan lahzada chiziladi (qotish sezilmaydi),
 * keyin belgi tayyor sahifadagi logotip o'rniga uchadi.
 */
let released = false;
const listeners = new Set<() => void>();

export const releaseIntroHold = (): void => {
  if (released) return;
  released = true;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Sahifani chizish mumkinmi: intro yo'q yoki belgi yig'ilib bo'ldi */
export const useIntroHoldReleased = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => released || plannedIntro() === null,
    () => true,
  );
