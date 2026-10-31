import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import uzUZ from 'antd/locale/uz_UZ';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/uz-latn';
import 'dayjs/locale/ru';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '../api';
import { onAccessTokenChange, tokenStore } from '../api/client';
import i18n, { getStoredLang, Lang } from '../i18n';
import { applyTheme, buildAntdTheme, type ThemeMode } from '../theme/tokens';
import { setDefaultCurrencySymbol } from '../utils/format';

interface AppSettingsValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Klub sozlamasidagi valyuta belgisi — o'rnatilmagan bo'lsa null */
  currencySymbol: string | null;
  /** Sozlamalar saqlangandan keyin belgini darhol yangilash uchun */
  setCurrencySymbol: (symbol: string | null) => void;
  /** Och ("fil suyagi") yoki qorong'i ("tungi zal") rejim */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

/**
 * Serverdagi urug' (seed) qiymati: settings.currencySymbol ustuni NOT NULL va
 * DB standarti "so'm", ya'ni klub hech narsa tanlamagan bo'lsa ham shu keladi.
 * Uni "o'rnatilmagan" deb qabul qilamiz — aks holda ruscha interfeysda ham
 * o'zbekcha "so'm" chiqib qolardi (t('common.sum') zaxirasi o'lik bo'lardi).
 */
const SEEDED_CURRENCY_SYMBOL = "so'm";

/** Tanlangan rejim shu kalitda (index.html dagi erta skript ham shuni o'qiydi) */
const THEME_KEY = 'bc.theme';

// Eski (ishlatilmaydigan) almashtirgich kaliti — tozalanadi
localStorage.removeItem('theme');

export const getStoredTheme = (): ThemeMode => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // saqlash yopiq (maxfiy rejim) — standart
  }
  return 'light';
};

// Birinchi chizishdan OLDIN — sahifa noto'g'ri rangda "chaqnab" qolmasin
applyTheme(getStoredTheme());

export const AppSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(getStoredLang);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredTheme);

  useLayoutEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  /**
   * Rejimni almashtirish. Brauzer qo'llasa — View Transitions bilan silliq
   * o'tish (butun sahifa bir zumda emas, yumshoq almashadi).
   */
  const setThemeMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // saqlanmasa ham joriy oynada ishlaydi
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduce) {
      doc.startViewTransition(() => {
        flushSync(() => setThemeModeState(next));
        applyTheme(next);
      });
    } else {
      setThemeModeState(next);
    }
  }, []);
  const toggleTheme = useCallback(
    () => setThemeMode(themeMode === 'light' ? 'dark' : 'light'),
    [themeMode, setThemeMode],
  );

  // Boshqa oynada almashtirilsa — bu oyna ham ergashadi
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        setThemeModeState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const themeConfig = useMemo(() => buildAntdTheme(themeMode), [themeMode]);

  // /ru/ dan kirgan foydalanuvchi uchun til eslab qolinadi (kirish, ish joyi ham ruscha)
  useEffect(() => {
    localStorage.setItem('lang', getStoredLang());
  }, []);
  const [currencySymbol, setCurrencySymbolState] = useState<string | null>(null);

  useEffect(() => {
    dayjs.locale(lang === 'ru' ? 'ru' : 'uz-latn');
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('lang', next);
    void i18n.changeLanguage(next);
    setLangState(next);
  }, []);

  const setCurrencySymbol = useCallback((symbol: string | null) => {
    const trimmed = symbol?.trim() || null;
    // Urug' qiymati = "tanlanmagan": tilga mos zaxira belgi ishlaydi
    const next = trimmed === SEEDED_CURRENCY_SYMBOL ? null : trimmed;
    setCurrencySymbolState(next);
    setDefaultCurrencySymbol(next ?? i18n.t('common.sum'));
  }, []);

  /**
   * Klub valyuta belgisi sozlamalardan olinadi. Token yo'q bo'lsa (landing,
   * login) so'rov yuborilmaydi; kirish/refresh paytida token o'zgarsa —
   * qayta o'qiladi. Xato bo'lsa belgi null qoladi va t('common.sum') ishlaydi.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tokenStore.getAccess()) {
        if (!cancelled) setCurrencySymbol(null);
        return;
      }
      try {
        const res = await settingsApi.get();
        if (!cancelled) setCurrencySymbol(res.data.currencySymbol);
      } catch {
        // Sozlama olinmadi (rol/klub konteksti yo'q) — zaxira belgi qoladi
      }
    };
    void load();
    const off = onAccessTokenChange(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [setCurrencySymbol]);

  // Til almashganda zaxira belgi ham o'sha tilga o'tadi ("so'm" / "сум")
  useEffect(() => {
    if (!currencySymbol) setDefaultCurrencySymbol(i18n.t('common.sum'));
  }, [lang, currencySymbol]);

  const value = useMemo(
    () => ({ lang, setLang, currencySymbol, setCurrencySymbol, themeMode, setThemeMode, toggleTheme }),
    [lang, setLang, currencySymbol, setCurrencySymbol, themeMode, setThemeMode, toggleTheme],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      <ConfigProvider theme={themeConfig} locale={lang === 'ru' ? ruRU : uzUZ}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = (): AppSettingsValue => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings AppSettingsProvider ichida ishlatilishi kerak');
  return ctx;
};

/**
 * KLUBGA tegishli pul uchun yagona valyuta yorlig'i: klub sozlamasidagi belgi,
 * u bo'lmasa t('common.sum').
 *
 * DIQQAT: faqat klub puliga ishlatiladi (sessiyalar, buyurtmalar, qarzlar,
 * tushum, xarajatlar). PLATFORMA hisob-kitobida (tarif narxi, faktura summasi)
 * ISHLATILMAYDI — Plan.price global qator bo'lib, valyuta ustuni yo'q va klub
 * belgisi erkin matn: "$" qo'ygan klub platforma narxini "300 000 $" ko'rardi.
 */
export const useCurrency = (): string => {
  const { currencySymbol } = useAppSettings();
  const { t } = useTranslation();
  return currencySymbol ?? t('common.sum');
};
