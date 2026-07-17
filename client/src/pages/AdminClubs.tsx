/**
 * ESKI yagona superadmin sahifasi endi /admin/* bo'limiga bo'lingan:
 *  - /admin              -> pages/admin/AdminDashboard (platforma statistikasi)
 *  - /admin/clubs        -> pages/admin/AdminClubsPage (klublar ro'yxati/boshqaruvi)
 *  - /admin/billing      -> pages/admin/AdminBilling
 *  - /admin/feedback     -> pages/admin/AdminFeedback
 *  - /admin/notifications-> pages/admin/AdminNotifications
 *  - /admin/logs         -> pages/admin/AdminLogs
 *  - /admin/settings     -> pages/admin/AdminSettings
 *
 * App.tsx dagi /admin marshruti yangi sahifalarga ulanguncha bu fayl
 * klublar sahifasini (eski sahifaning barcha imkoniyatlari shu yerda)
 * qayta eksport qilib turadi.
 */
export { default } from './admin/AdminClubsPage';
