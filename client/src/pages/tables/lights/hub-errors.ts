import { errorMessage } from '../../../api';

/**
 * Electron IPC xatosi "Error invoking remote method 'billiardclub:lights:test':
 * Error: ..." ko'rinishida keladi — foydalanuvchiga faqat oxirgi qism kerak.
 */
export const hubErrorText = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/i, '')
    .replace(/^(?:Error:\s*)+/i, '')
    .trim();
};

/** Server (axios) yoki kompyuterdagi markaz (IPC) xatosidan ko'rsatiladigan matn */
export const lightErrorText = (err: unknown, fallback: string): string =>
  typeof err === 'object' && err !== null && 'isAxiosError' in err
    ? errorMessage(err, fallback)
    : hubErrorText(err) || fallback;

/** Markazda stol sozlamasi hali yo'q (saqlangandan keyin bir necha soniya) */
export const isHubConfigPending = (text: string): boolean => /yetib kelmadi/i.test(text);
