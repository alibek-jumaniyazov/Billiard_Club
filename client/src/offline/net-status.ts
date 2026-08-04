/**
 * TARMOQ HOLATI — "server bilan aloqa bormi" ning HAQIQIY belgisi.
 *
 * `navigator.onLine` ga ishonib bo'lmaydi: u faqat "tarmoq interfeysi yoqilgan"
 * degani. Wi-Fi ulangan, lekin internet yo'q (klubdagi eng ko'p uchraydigan
 * holat) bo'lsa u `true` qaytaraveradi.
 *
 * Shuning uchun holat HAQIQIY so'rovlar natijasidan olinadi: axios
 * interceptor'i har muvaffaqiyatli javobda `markOnline()`, javobsiz
 * (tarmoq/timeout) xatoda `markOffline()` chaqiradi. Ilova baribir har
 * 15 soniyada so'rov yuboradi, shuning uchun qo'shimcha "ping" kerak emas.
 *
 * Bu modul BOG'LIQLIKSIZ — api/client.ts undan import qiladi, shuning uchun
 * bu yerdan hech narsa import qilinmasligi kerak (aylanma import bo'lmasin).
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();

/**
 * Boshlang'ich taxmin: brauzer "oflayn" desa — oflayn, aks holda onlayn deb
 * boshlaymiz va birinchi so'rov haqiqatni aniqlaydi.
 */
let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

/**
 * Bitta muvaffaqiyatsiz so'rov hali "oflayn" degani emas (bitta so'rov
 * timeout bo'lishi mumkin). Ketma-ket 2 ta javobsiz xatodan keyin oflayn
 * deb belgilanadi — bu chizig'i bejiz miltillamasligi uchun.
 */
const OFFLINE_THRESHOLD = 2;
let consecutiveFailures = 0;

const emit = () => listeners.forEach((fn) => fn(online));

export const isOnline = (): boolean => online;

export const onNetworkChange = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Serverdan javob keldi (hatto 4xx bo'lsa ham — aloqa BOR degani) */
export const markOnline = (): void => {
  consecutiveFailures = 0;
  if (!online) {
    online = true;
    emit();
  }
};

/** So'rov javobsiz qoldi (tarmoq uzilgan / server yo'q) */
export const markOffline = (): void => {
  consecutiveFailures += 1;
  if (online && consecutiveFailures >= OFFLINE_THRESHOLD) {
    online = false;
    emit();
  }
};

if (typeof window !== 'undefined') {
  // Brauzer signallari — "ishonchli emas, lekin foydali" maslahat sifatida
  window.addEventListener('offline', () => {
    consecutiveFailures = OFFLINE_THRESHOLD;
    if (online) {
      online = false;
      emit();
    }
  });
  // Interfeys qayta ulandi — haqiqatni keyingi so'rov tasdiqlaydi,
  // lekin darhol urinib ko'rish uchun optimistik "onlayn" qo'yamiz
  window.addEventListener('online', () => markOnline());
}
