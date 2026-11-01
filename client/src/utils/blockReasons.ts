import type { ClubBlockReason } from '../types';

/** Superadmin tanlaydigan tayyor blok sabablari — server `ClubBlockReason` bilan bir xil */
export const BLOCK_REASONS: readonly ClubBlockReason[] = [
  'free_plan_abuse',
  'unpaid',
  'rules_violation',
  'suspicious_activity',
  'owner_request',
  'other',
];

/**
 * To'lov bilan hal bo'ladigan sabablar. Blok ekranida klub egasiga tariflar
 * ochiladi; superadmin to'lovni tasdiqlaganda "blokdan ham chiqarish" oldindan
 * belgilangan bo'ladi (baribir uning o'zi hal qiladi).
 */
export const isPaymentResolvable = (reason?: ClubBlockReason | null): boolean =>
  reason === 'free_plan_abuse' || reason === 'unpaid';
