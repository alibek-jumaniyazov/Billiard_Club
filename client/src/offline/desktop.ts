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
  /** Foydalanuvchi o'zi boshlagan tekshiruv (menyu) — faqat shunda xabar chiqadi */
  manual?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Chiroq markazi (kassa kompyuterining o'zi relelarni boshqaradi)     */
/* ------------------------------------------------------------------ */

/** Markazdagi bitta stolning holati (desktop/lights.js -> bridge/lib/hub.js status()) */
export interface LightHubTableStatus {
  tableId: number;
  tableNumber: number | null;
  tableName: string | null;
  driver: string;
  /** Hozir yonishi kerakmi (lokal qoida bo'yicha) */
  desired: boolean;
  /** Qayerdan: cloud | view | local | override | override-local */
  source: string;
  /** Oxirgi buyruq natijasi (null — hali yuborilmagan) */
  ok: boolean | null;
  /** Reledan o'qilgan haqiqiy holat (o'qib bo'lmasa null) */
  actual: boolean | null;
  error: string | null;
  at: string | null;
  /** Parol diskda saqlanmagan — internet qaytguncha boshqarilmaydi */
  authMissing: boolean;
}

export interface LightHubCloudStatus {
  configured: boolean;
  online: boolean;
  lastOkAt: string | null;
  lastError: string | null;
  /** Token bekor qilingan / boshqa agent ulangan — markaz relelarga tegmaydi */
  authFailed: boolean;
}

export interface LightHubStatus {
  /** Dvigatel dasturda bormi (eski versiyada yo'q) */
  available: boolean;
  error: string | null;
  /** Windows shifrlash xizmati bor-yo'qligi (token shu bilan saqlanadi) */
  encryption: boolean;
  enabled: boolean;
  running: boolean;
  hub: null | {
    running: boolean;
    kind: string;
    agentVersion: string;
    cloud: LightHubCloudStatus;
    rulesKnown: boolean;
    serverNow: string;
    evidenceAt: string | null;
    tables: LightHubTableStatus[];
  };
}

/** Kassa ekranidagi bitta stolning holati — markazga uzatiladi */
export interface LightHubViewTable {
  tableId: number;
  session: 'active' | 'paused' | null;
  /** Shu holat boshlangan vaqt (ISO) */
  since: string | null;
  /** Amal kassada navbatda — serverga hali yetmagan */
  pending: boolean;
  /** O'yin tugagan vaqt (grace uchun) */
  endedAt: string | null;
}

export interface LightHubView {
  /** Stollar serverdan OXIRGI marta olingan vaqt (server soati, ms) */
  fetchedAt: number | null;
  /** Kassaning server soati bo'yicha "hozir"i (ms) */
  serverNow: number | null;
  tables: LightHubViewTable[];
}

/** Qidiruvda topilgan qurilma (LAN yoki USB) */
export interface LightHubDiscovered {
  driver?: string;
  host?: string;
  serialPort?: string;
  serialNumber?: string;
  id?: string;
  name?: string;
  model?: string;
  mac?: string;
  channels?: number;
  version?: string;
  encrypt?: boolean;
  /** Sozlashda qo'shimcha kiritilishi kerak bo'lgan maydonlar (localKey, deviceKey, entity...) */
  needs?: string[];
}

export interface LightHubTestResult {
  ok: boolean;
  on: boolean;
  actual: boolean | null;
  attempts: number;
  error: string | null;
  latencyMs?: number;
}

/** Tuya IoT bulutidan import qilingan qurilma (lokal kalit bilan) */
export interface TuyaCloudDevice {
  id: string;
  name: string;
  localKey: string;
  ip?: string;
  productName?: string;
  online?: boolean;
}

export interface DesktopLightsBridge {
  status: () => Promise<LightHubStatus>;
  enable: (token: string) => Promise<LightHubStatus>;
  disable: () => Promise<LightHubStatus>;
  pushView: (view: LightHubView) => void;
  override: (params: { tableIds?: number[] | null; on?: boolean | null; minutes?: number }) =>
    Promise<{ tables: number; until: string }>;
  test: (tableId: number, on: boolean) => Promise<LightHubTestResult>;
  discover: (subnet?: string) => Promise<{ subnet: string | null; devices: LightHubDiscovered[] }>;
  tuyaCloud: (params: { accessId: string; accessSecret: string; region: string; userId?: string }) =>
    Promise<TuyaCloudDevice[]>;
  onStatus: (cb: (status: LightHubStatus) => void) => () => void;
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
  /** Chiroq markazi — 1.4.0 dan; eski dasturda yo'q */
  lights?: DesktopLightsBridge;
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

/** Chiroq markazi ko'prigi (brauzerda va eski desktop dasturda `undefined`) */
export const desktopLights = (): DesktopLightsBridge | undefined => window.billiardclubDesktop?.lights;
