/**
 * DESKTOP QOBIQ KO'PRIGI — veb-ilova tomonidagi yagona kirish nuqtasi.
 *
 * Qobiq (desktop/preload.js) `window.billiardclubDesktop` ni ochadi. Brauzerda
 * u YO'Q, shuning uchun bu yerdagi hamma narsa ixtiyoriy tekshiriladi va
 * brauzerda jimgina "desktop emas" degan javob beradi.
 *
 * Tur e'loni ATAYLAB shu yerda — bitta joyda: ilgari u ConnectionContext
 * ichida turardi va yangilanish API si qo'shilganda ikkita fayl bir xil
 * global interfeysni har xil e'lon qilib, TS to'qnashuvi chiqarardi.
 */

/** Avtomatik yangilanish holati (desktop/main.js dan keladi) */
export type DesktopUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'uptodate'
  | 'error';

export interface DesktopUpdateStatus {
  state: DesktopUpdateState;
  /** Yangi versiya raqami — 'available' va 'ready' holatlarida */
  version?: string;
  /** Yuklab olish foizi — 'downloading' holatida */
  percent?: number;
  /** Xato matni — 'error' holatida */
  message?: string;
}

export interface DesktopBridge {
  isDesktop: boolean;
  /** Ilova versiyasi (package.json dagi `version`) */
  version: string;
  /** Electron versiyasi — faqat diagnostika uchun */
  electron: string;
  reportPending: (count: number) => void;
  /** Yangilanishni QO'LDA tekshirish */
  checkForUpdates?: () => void;
  /** Tayyor yangilanishni darhol o'rnatib, qayta ishga tushirish */
  quitAndInstall?: () => void;
  /**
   * Yangilanish holatiga obuna. Qaytaradi: obunani bekor qiluvchi funksiya.
   * Chaqirilganda joriy holat DARHOL bir marta yuboriladi (React
   * komponenti kech ulanib, holatni butunlay o'tkazib yubormasligi uchun).
   */
  onUpdateStatus?: (cb: (status: DesktopUpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    billiardclubDesktop?: DesktopBridge;
  }
}

/** Ilova Electron qobig'ida ishlayaptimi */
export const isDesktop = (): boolean => Boolean(window.billiardclubDesktop?.isDesktop);

/** Qobiq ko'prigi (brauzerda `undefined`) */
export const desktopBridge = (): DesktopBridge | undefined => window.billiardclubDesktop;
