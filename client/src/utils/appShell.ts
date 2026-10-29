import { isDesktop } from '../offline/desktop';
import { androidShellVersion } from './version';

/**
 * O'rnatilgan dastur qobig'i — veb-ilova sayt sifatida emas, DASTUR sifatida
 * ochilganmi:
 *  - Windows: Electron qobig'i preload orqali `billiardclubDesktop` beradi;
 *  - Android: Capacitor qobig'i user-agent'ga `BilliardClubAndroid/<versiya>` yozadi.
 *
 * Dastur ichida reklama sahifasi (landing), "ilovani o'rnating/yuklab oling"
 * takliflari ko'rsatilmaydi — u to'g'ridan-to'g'ri kirish/ish ekranidan ochiladi.
 */
export const isAndroidShell = (userAgent?: string): boolean => androidShellVersion(userAgent) !== null;

export const isAppShell = (): boolean => isDesktop() || isAndroidShell();
