import { isTransientDbConnectError } from './transient-db-error';

/** pg-pool dan bizga kerakli qism */
interface PoolLike {
  connect: (...args: unknown[]) => unknown;
}

interface ClientLike {
  release: (err?: unknown) => void;
}

type ConnectCallback = (err: unknown, client?: ClientLike, done?: (err?: unknown) => void) => void;

export interface ConnectRetryOptions {
  /** Qo'shimcha urinishlar soni (birinchisidan tashqari) */
  retries?: number;
  /** Urinishlar orasidagi kutish (ms), har safar oshib boradi: d, 2d, ... */
  baseDelayMs?: number;
  onRetry?: (err: unknown, attempt: number) => void;
  /** Testlar uchun */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * pg-pool ga ULANISH BOSQICHIDA qayta urinishni qo'shadi.
 *
 * Nega xavfsiz: ulanish ochilmasa so'rov hali bazaga yetmagan — hech narsa
 * bajarilmagan. Shuning uchun har qanday so'rov (GET ham, pul amali ham) uchun
 * qayta urinish ikki marta yozishga olib kelmaydi. Allaqachon ochilgan ulanishda
 * so'rov paytida chiqqan xatolar bu yerga TEGMAYDI — ular odatdagidek qaytadi.
 *
 * TypeORM ulanishni callback shaklida so'raydi (`pool.connect((err, client,
 * release) => ...)`), pg-pool ning o'zi Promise shaklini ham qo'llaydi — ikkalasi
 * saqlanadi.
 */
export function addConnectRetry(pool: PoolLike, options: ConnectRetryOptions = {}): void {
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 300);
  const sleep = options.sleep ?? defaultSleep;
  const original = pool.connect.bind(pool) as () => Promise<ClientLike>;

  const connectWithRetry = async (): Promise<ClientLike> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await original();
      } catch (err) {
        if (attempt >= retries || !isTransientDbConnectError(err)) throw err;
        options.onRetry?.(err, attempt + 1);
        // eslint-disable-next-line no-await-in-loop
        await sleep(baseDelayMs * (attempt + 1));
      }
    }
  };

  pool.connect = ((callback?: ConnectCallback) => {
    if (typeof callback !== 'function') return connectWithRetry();
    connectWithRetry().then(
      (client) => callback(undefined, client, (err?: unknown) => client.release(err)),
      (err) => callback(err, undefined, () => undefined),
    );
    return undefined;
  }) as PoolLike['connect'];
}
