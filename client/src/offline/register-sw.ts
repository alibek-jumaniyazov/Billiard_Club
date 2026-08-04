/**
 * SERVICE WORKER RO'YXATDAN O'TKAZISH va yangilanish oqimi.
 *
 * MUHIM QOIDA: kassir ish o'rtasida sahifa O'ZI qayta yuklanmaydi. Yangi
 * versiya tayyor bo'lganda faqat XABAR ko'rsatiladi ("Yangilanish tayyor —
 * yangilash"), qayta yuklash foydalanuvchi bosgandan keyin bo'ladi. Aks holda
 * ochiq hisob-kitob oynasi yo'qolib, kassir summani qaytadan kiritishga
 * majbur bo'lardi.
 */

type UpdateListener = () => void;

let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<UpdateListener>();

/** Yangi versiya kutayotganini bildiradi (UI da "yangilash" tugmasi) */
export const onUpdateReady = (fn: UpdateListener): (() => void) => {
  updateListeners.add(fn);
  if (waitingWorker) fn();
  return () => updateListeners.delete(fn);
};

export const isUpdateReady = (): boolean => waitingWorker !== null;

/** Kutayotgan versiyaga o'tish — sahifa shundan keyin bir marta qayta yuklanadi */
export const applyUpdate = (): void => {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
};

const markWaiting = (worker: ServiceWorker | null) => {
  waitingWorker = worker;
  if (worker) updateListeners.forEach((fn) => fn());
};

export const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return;
  // Dev serverda SW yo'q (build artefakti) — ro'yxatdan o'tkazish 404 beradi
  if (import.meta.env.DEV) return;
  // Electron qobig'ida ilova fayllari allaqachon lokal — SW keraksiz
  if (window.location.protocol === 'file:') return;

  let reloading = false;
  /**
   * BIRINCHI o'rnatishda qayta yuklash BO'LMASLIGI kerak.
   *
   * Service worker `activate` da `clients.claim()` chaqiradi va bu allaqachon
   * ochiq turgan sahifada `controllerchange` hodisasini keltirib chiqaradi.
   * Shartsiz qayta yuklash bu yerda ilovaga birinchi kirgan foydalanuvchining
   * sahifasini kutilmaganda yangilab yuborardi (to'ldirilayotgan forma yo'qoladi).
   * Shuning uchun qayta yuklash FAQAT eski versiya boshqarayotgan sahifada,
   * ya'ni haqiqiy YANGILANISHda bajariladi.
   */
  const hadControllerAtStart = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadControllerAtStart) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) markWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // controller bor = eski versiya ishlab turibdi, ya'ni bu YANGILANISH
            // (birinchi o'rnatishda xabar ko'rsatilmaydi)
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              markWaiting(registration.waiting ?? installing);
            }
          });
        });

        // Uzoq ochiq turgan kassa oynasi ham yangilanishni sezsin
        setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch(() => {
        // SW ro'yxatdan o'tmasa ilova ONLAYN rejimda avvalgidek ishlaydi
      });
  });
};
