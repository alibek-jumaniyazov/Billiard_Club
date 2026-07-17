import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import uzUZ from 'antd/locale/uz_UZ';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/uz-latn';
import 'dayjs/locale/ru';
import i18n, { getStoredLang, Lang } from '../i18n';
import { buildAntdTheme } from '../theme/tokens';

interface AppSettingsValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

/** Tema FAQAT qorong'i — yagona manba: src/theme/tokens.ts */
const themeConfig = buildAntdTheme();

// Eski yorug'/qorong'i almashtirgichdan qolgan kalitni tozalaymiz
localStorage.removeItem('theme');

export const AppSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  useEffect(() => {
    dayjs.locale(lang === 'ru' ? 'ru' : 'uz-latn');
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('lang', next);
    void i18n.changeLanguage(next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

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
