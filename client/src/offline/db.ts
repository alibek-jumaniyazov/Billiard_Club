/**
 * OFFLINE SAQLAGICH — bog'liqliksiz (dependency-free) IndexedDB o'ramasi.
 *
 * Nega IndexedDB, localStorage emas:
 *  - localStorage sinxron (UI ni bloklaydi) va ~5MB bilan cheklangan;
 *  - navbatdagi yozuv amallari kassaning PULI — ular brauzer yopilib
 *    qayta ochilganda ham joyida turishi shart.
 *
 * Nega kutubxona emas: bu qatlam ~150 satr va POS ning eng past darajasida
 * turadi — tashqi paketning versiya/o'lchov riski bu yerda ortiqcha.
 *
 * BARCHA funksiyalar xatoga chidamli: IndexedDB yopiq bo'lsa (Safari private,
 * korporativ siyosat, kvota to'lgan) ular jimgina "yo'q" qaytaradi va ilova
 * ONLAYN rejimda avvalgidek ishlayveradi — offline imkoniyat qo'shimcha,
 * majburiy emas.
 */

const DB_NAME = 'billiardclub-offline';
const DB_VERSION = 1;

/** Navbatdagi mutatsiyalar (FIFO, autoIncrement) */
export const STORE_QUEUE = 'queue';
/** GET javoblari keshi (kalit: scope bilan) */
export const STORE_CACHE = 'cache';
/** Kichik kalit-qiymat metadata (oxirgi sinxronizatsiya vaqti va h.k.) */
export const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        // autoIncrement kaliti FIFO tartibini kafolatlaydi — navbat aynan
        // qo'yilgan ketma-ketlikda qayta yuboriladi (pause -> resume -> end)
        db.createObjectStore(STORE_QUEUE, { keyPath: 'seq', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Boshqa tab yangi versiyaga o'tmoqchi bo'lsa ulanishni bo'shatamiz,
      // aks holda o'sha tab "blocked" holatida qotib qoladi
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
};

/** IndexedDB umuman ishlatiladimi (offline imkoniyat mavjudmi) */
export const offlineStorageAvailable = async (): Promise<boolean> => (await openDb()) !== null;

const runTx = async <T>(
  store: string,
  mode: IDBTransactionMode,
  work: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(store, mode);
    } catch {
      resolve(null);
      return;
    }
    let result: T | null = null;
    try {
      const request = work(tx.objectStore(store));
      request.onsuccess = () => {
        result = request.result;
      };
    } catch {
      resolve(null);
      return;
    }
    // Natija FAQAT tranzaksiya yakunlangach qaytariladi: aks holda yozuv
    // hali diskka tushmagan bo'lishi mumkin (kvota xatosi abort beradi)
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
};

export const idbGet = <T>(store: string, key: IDBValidKey): Promise<T | null> =>
  runTx<T>(store, 'readonly', (os) => os.get(key) as IDBRequest<T>);

export const idbGetAll = async <T>(store: string): Promise<T[]> =>
  (await runTx<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)) ?? [];

export const idbPut = <T>(store: string, value: T): Promise<IDBValidKey | null> =>
  runTx<IDBValidKey>(store, 'readwrite', (os) => os.put(value) as IDBRequest<IDBValidKey>);

export const idbDelete = (store: string, key: IDBValidKey): Promise<null> =>
  runTx<null>(store, 'readwrite', (os) => os.delete(key) as unknown as IDBRequest<null>);

export const idbClear = (store: string): Promise<null> =>
  runTx<null>(store, 'readwrite', (os) => os.clear() as unknown as IDBRequest<null>);

export const idbCount = async (store: string): Promise<number> =>
  (await runTx<number>(store, 'readonly', (os) => os.count() as IDBRequest<number>)) ?? 0;

/**
 * Kalit-qiymat metadata (oxirgi sinxronizatsiya sanasi kabi kichik qiymatlar).
 */
export const metaGet = async <T>(key: string): Promise<T | null> => {
  const row = await idbGet<{ key: string; value: T }>(STORE_META, key);
  return row ? row.value : null;
};

export const metaSet = <T>(key: string, value: T): Promise<IDBValidKey | null> =>
  idbPut(STORE_META, { key, value });
