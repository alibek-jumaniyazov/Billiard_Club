/**
 * Katta faylni bo'laklab yuklash (reliz o'rnatgichlari: 100+ MB).
 *
 * NEGA. Server oldidagi reverse proxy (nginx `client_max_body_size`, CDN)
 * katta so'rovni 413 bilan qaytaradi — production'da chegara ~6 MB edi va
 * 110 MB lik Windows o'rnatgichi umuman o'tmasdi. Bo'laklar har qanday
 * shunday chegaradan o'tadi:
 *  - server javobidagi `received` — haqiqat manbai: javob yo'qolib bo'lak
 *    qayta yuborilsa ham, oldinga sakrasa ham to'g'ri joydan davom etiladi;
 *  - 413 kelsa bo'lak ikki baravar kichrayadi (proksi yanada qattiqroq bo'lsa);
 *  - tarmoq/5xx xatolarida bir necha marta kutib qayta uriniladi;
 *  - xato yoki bekor qilinganda serverdagi yarim fayl o'chiriladi.
 */

export interface ChunkedUploadApi<T> {
  start: () => Promise<{ uploadId: string; chunkSize: number }>;
  chunk: (uploadId: string, offset: number, blob: Blob, signal?: AbortSignal) => Promise<{ received: number }>;
  complete: (uploadId: string) => Promise<T>;
  abort: (uploadId: string) => Promise<unknown>;
}

export interface ChunkedUploadOptions {
  /** 0..100 — yakunlash bosqichigacha 99 dan oshmaydi */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Bitta bo'lak uchun ketma-ket muvaffaqiyatsiz urinishlar chegarasi */
  retries?: number;
  /** Testlarda kutishni almashtirish uchun */
  wait?: (ms: number) => Promise<void>;
}

/** Proksi juda qattiq bo'lsa ham bundan kichraymaydi */
export const MIN_CHUNK_BYTES = 256 * 1024;

const statusOf = (err: unknown): number =>
  (err as { response?: { status?: number } } | null)?.response?.status ?? 0;

const isAbort = (err: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) ||
  (err as { name?: string } | null)?.name === 'AbortError' ||
  (err as { name?: string } | null)?.name === 'CanceledError';

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Qayta urinsa bo'ladigan xato: javob yo'q (tarmoq), 408, 429 yoki 5xx */
const isRetryable = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500;

export const uploadInChunks = async <T>(
  file: Blob,
  api: ChunkedUploadApi<T>,
  { onProgress, signal, retries = 5, wait = defaultWait }: ChunkedUploadOptions = {},
): Promise<T> => {
  const { uploadId, chunkSize: serverChunk } = await api.start();
  let chunkSize = Math.max(MIN_CHUNK_BYTES, serverChunk);
  let offset = 0;
  let failures = 0;

  try {
    while (offset < file.size) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const blob = file.slice(offset, Math.min(file.size, offset + chunkSize));
      try {
        const { received } = await api.chunk(uploadId, offset, blob, signal);
        // Server yozmadi (offset mos kelmadi) — uning soni bilan davom etamiz,
        // lekin cheksiz aylanishga yo'l qo'yilmaydi
        if (received === offset) failures += 1;
        else failures = 0;
        if (failures > retries) throw new Error('Upload is not progressing');
        offset = received;
        onProgress?.(Math.min(99, Math.floor((offset / file.size) * 100)));
      } catch (err) {
        if (isAbort(err, signal)) throw err;
        const status = statusOf(err);
        if (status === 413 && chunkSize > MIN_CHUNK_BYTES) {
          chunkSize = Math.max(MIN_CHUNK_BYTES, Math.floor(chunkSize / 2));
          continue;
        }
        if (!isRetryable(status)) throw err;
        failures += 1;
        if (failures > retries) throw err;
        await wait(Math.min(8000, 500 * 2 ** (failures - 1)));
      }
    }
    const result = await api.complete(uploadId);
    onProgress?.(100);
    return result;
  } catch (err) {
    // Serverda yarim fayl qolmasin — o'chirish xatosi asosiy xatoni yashirmaydi
    void api.abort(uploadId).catch(() => undefined);
    throw err;
  }
};
