import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from './common';
import dashboard from './pages/dashboard';
import tables from './pages/tables';
import sessions from './pages/sessions';
import orders from './pages/orders';
import products from './pages/products';
import debts from './pages/debts';
import reports from './pages/reports';
import staff from './pages/staff';
import settings from './pages/settings';
import login from './pages/login';
import register from './pages/register';
import landing from './pages/landing';
import adminClubs from './pages/adminClubs';
import locked from './pages/locked';
import subscription from './pages/subscription';
import profile from './pages/profile';
import customers from './pages/customers';
import expenses from './pages/expenses';
import reservations from './pages/reservations';
import feedback from './pages/feedback';
import notifications from './pages/notifications';
import admin from './pages/admin';
import game from './pages/game';
import offline from './pages/offline';
import download from './pages/download';
import adminClubData from './pages/adminClubData';
import adminReleases from './pages/adminReleases';

export type Lang = 'uz' | 'ru';

/** Sahifa moduli: har bir sahifa o'z namespace faylini boshqaradi */
type PageDict = { uz: Record<string, string>; ru: Record<string, string> };

const pages: Record<string, PageDict> = {
  dashboard,
  tables,
  sessions,
  orders,
  products,
  debts,
  reports,
  staff,
  settings,
  login,
  register,
  landing,
  adminClubs,
  locked,
  subscription,
  profile,
  customers,
  expenses,
  reservations,
  feedback,
  notifications,
  admin,
  game,
  offline,
  download,
  adminClubData,
  adminReleases,
};

const buildLocale = (lang: Lang): Record<string, string> => {
  const merged: Record<string, string> = { ...common[lang] };
  for (const [ns, dict] of Object.entries(pages)) {
    for (const [key, value] of Object.entries(dict[lang] ?? {})) {
      merged[`${ns}.${key}`] = value;
    }
  }
  return merged;
};

export const getStoredLang = (): Lang =>
  (localStorage.getItem('lang') === 'ru' ? 'ru' : 'uz') as Lang;

/**
 * Sinov muddatining STANDART qiymati — serverdan javob kelgunicha ishlatiladi.
 * Haqiqiy qiymat superadmin sozlamasidan keladi (`setTrialDays`).
 */
const DEFAULT_TRIAL_DAYS = 7;

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: buildLocale('uz') },
    ru: { translation: buildLocale('ru') },
  },
  lng: getStoredLang(),
  fallbackLng: 'uz',
  interpolation: {
    escapeValue: false,
    /**
     * `{{days}}` — bepul sinov muddati. Landing matnlarida u O'NDAN ORTIQ
     * joyda uchraydi (sarlavha, CTA, tariflar, FAQ, meta teglar), shuning
     * uchun har bir `t()` chaqiruviga qo'lda uzatish o'rniga GLOBAL standart
     * qiymat sifatida beriladi. Bittasini uzatishni unutish sahifada
     * xom "{{days}}" ko'rinib qolishiga olib kelardi.
     */
    defaultVariables: { days: DEFAULT_TRIAL_DAYS },
  },
});

/**
 * Sinov muddatini serverdan kelgan qiymatga o'rnatadi.
 *
 * `t()` interpolatsiyani CHAQIRUV paytida bajaradi, shuning uchun qiymat
 * yangilangach komponent qayta render bo'lishi kifoya — tarjimalarni qayta
 * yuklash shart emas. Chaqiruvchi (Landing) qiymatni holatga yozadi va
 * shu bilan qayta render yuz beradi.
 */
export const setTrialDays = (days: number): void => {
  if (!Number.isFinite(days) || days < 0) return;
  const interpolation = i18n.options.interpolation ?? {};
  interpolation.defaultVariables = { ...interpolation.defaultVariables, days };
  i18n.options.interpolation = interpolation;
};

export default i18n;
