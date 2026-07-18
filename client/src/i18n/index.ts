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

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: buildLocale('uz') },
    ru: { translation: buildLocale('ru') },
  },
  lng: getStoredLang(),
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
});

export default i18n;
