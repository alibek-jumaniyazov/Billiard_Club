import type { ClubDeletePreview } from '../../types';

/**
 * Klubni butunlay o'chirish oynasida ko'rsatiladigan bo'limlar — ko'rsatish tartibida.
 * Kalit — server jadvali (GET /admin/clubs/:id/delete-preview → counts), yorliq —
 * i18n `adminClubs.purge_<kalit>`. Texnik jadvallar (sozlamalar, to'lov satrlari,
 * takroriy so'rov kalitlari, bog'lash tokenlari) ham o'chadi, lekin ro'yxatda chiqmaydi.
 */
export const CLUB_DELETE_ROWS = [
  'users',
  'tables',
  'sessions',
  'orders',
  'sales',
  'customers',
  'debts',
  'products',
  'categories',
  'expenses',
  'reservations',
  'cash_shifts',
  'feedbacks',
  'club_notifications',
  'owner_telegram_chats',
  'club_bridges',
  'audit_logs',
] as const;

export type ClubDeleteRow = (typeof CLUB_DELETE_ROWS)[number];

/** Noldan katta bo'limlar — ko'rsatish tartibida */
export const clubDeleteRows = (preview: ClubDeletePreview): Array<{ key: ClubDeleteRow; count: number }> =>
  CLUB_DELETE_ROWS.map((key) => ({ key, count: Math.max(0, preview.counts[key] ?? 0) })).filter((row) => row.count > 0);

/** Platforma to'lov tarixidan saqlanadigan narsa bormi */
export const clubDeleteKeepsBilling = (preview: ClubDeletePreview): boolean =>
  preview.billing.contracts > 0 || preview.billing.paidInvoices > 0;

/**
 * Tasdiq: yozilgan nom klub nomiga AYNAN mos (faqat chetdagi bo'shliqlar e'tiborsiz) —
 * serverdagi qoida bilan bir xil (club-purge.service.ts), shuning uchun tugma faqat
 * server qabul qiladigan holatda faollashadi.
 */
export const confirmNameMatches = (typed: string, clubName: string): boolean => {
  const value = typed.trim();
  return value !== '' && value === clubName.trim();
};
