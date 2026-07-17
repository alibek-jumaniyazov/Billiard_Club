import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { App as AntApp, ConfigProvider, theme as antTheme } from 'antd';
import uzUZ from 'antd/locale/uz_UZ';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/uz-latn';
import 'dayjs/locale/ru';
import i18n, { getStoredLang, Lang } from '../i18n';

interface AppSettingsValue {
  isDarkMode: boolean;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

/** Brend ranglari — billiard: to'q yashil mato + oltin */
const BRAND = {
  gold: '#faad14',
  darkGreen: '#1b5e20',
  siderDark: '#0f291e',
  bgDark: '#0a1c14',
  cardDark: '#133526',
};

export const AppSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('theme') !== 'light',
  );
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDarkMode);
    document.body.classList.toggle('light-theme', !isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    dayjs.locale(lang === 'ru' ? 'ru' : 'uz-latn');
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      localStorage.setItem('theme', prev ? 'light' : 'dark');
      return !prev;
    });
  }, []);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('lang', next);
    void i18n.changeLanguage(next);
    setLangState(next);
  }, []);

  const themeConfig = useMemo(
    () => ({
      algorithm: isDarkMode ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: {
        colorPrimary: isDarkMode ? BRAND.gold : BRAND.darkGreen,
        borderRadius: 8,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        ...(isDarkMode
          ? { colorBgLayout: BRAND.bgDark, colorBgContainer: BRAND.cardDark }
          : {}),
      },
      components: {
        Layout: isDarkMode
          ? { siderBg: BRAND.siderDark, headerBg: BRAND.siderDark, bodyBg: BRAND.bgDark }
          : { siderBg: '#ffffff', headerBg: '#ffffff' },
        Button: {
          primaryShadow: 'none',
        },
      },
    }),
    [isDarkMode],
  );

  const value = useMemo(
    () => ({ isDarkMode, toggleTheme, lang, setLang }),
    [isDarkMode, toggleTheme, lang, setLang],
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
