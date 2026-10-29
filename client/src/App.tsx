import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/layout/AppLayout';
import BrandLogo from './components/ui/BrandLogo';
import { TOKENS } from './theme/tokens';
import { viewingClub } from './api/client';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './types';
import Login from './pages/Login';
import Locked from './pages/Locked';
import NotFound from './pages/NotFound';
import { isAppShell } from './utils/appShell';

const Landing = lazy(() => import('./pages/Landing'));
const Download = lazy(() => import('./pages/Download'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tables = lazy(() => import('./pages/Tables'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Orders = lazy(() => import('./pages/Orders'));
const Products = lazy(() => import('./pages/Products'));
const Debts = lazy(() => import('./pages/Debts'));
const Reports = lazy(() => import('./pages/Reports'));
const Staff = lazy(() => import('./pages/Staff'));
const Settings = lazy(() => import('./pages/Settings'));
const Customers = lazy(() => import('./pages/Customers'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Reservations = lazy(() => import('./pages/Reservations'));
const Feedback = lazy(() => import('./pages/Feedback'));
const BilliardGame = lazy(() => import('./pages/game/BilliardGame'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminClubsPage = lazy(() => import('./pages/admin/AdminClubsPage'));
const AdminClubData = lazy(() => import('./pages/admin/AdminClubData'));
const AdminReleases = lazy(() => import('./pages/admin/AdminReleases'));
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const AdminLeads = lazy(() => import('./pages/admin/AdminLeads'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

/**
 * Sovuq start (auth tekshiruvi) va har lazy-marshrut uchun YAGONA fallback.
 * Yakka kulrang Spin "buzilganmi?" degan taassurot berardi — brend belgisi +
 * nom + nozik yuklagich ilova ataylab yuklanayotganini ko'rsatadi.
 */
const FullScreenSpin = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      background: TOKENS.color.bg.bg0,
    }}
  >
    <BrandLogo size={56} withWordmark />
    <Spin />
  </div>
);

/**
 * Autentifikatsiya qilingan foydalanuvchining "bosh sahifasi".
 * Operator moliyaviy bosh sahifani (tushum/foyda) ko'rmaydi — uning ishi
 * stollar/bar, shuning uchun uy sahifasi /tables (server ham /dashboard/stats
 * ni operatorga bermaydi).
 */
const homeFor = (role: UserRole): string =>
  role === 'superadmin' ? '/admin' : role === 'operator' ? '/tables' : '/dashboard';

/**
 * "Klubni ko'rish" rejimidagi superadmin uchun ham YOPIQ sahifalar —
 * server bu endpointlarda superadminni 403 bilan qaytaradi
 */
const SUPERADMIN_VIEW_BLOCKED = ['/feedback', '/notifications', '/subscription'];

/**
 * Himoyalangan marshrut:
 *  1) autentifikatsiya
 *  2) obuna holati (muddati tugagan/bloklangan klub -> /locked)
 *  3) rol tekshiruvi (superadmin "klubni ko'rish" rejimida klub sahifalariga kira oladi)
 */
const Protected = ({ roles, children }: { roles?: UserRole[]; children: ReactNode }) => {
  const { user, loading, hasRole, subscriptionLocked, offlineAccess } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenSpin />;
  if (!user) return <Navigate to="/login" replace />;

  /**
   * OBUNA BLOKI — uch manba, ixtiyoriysi yetarli:
   *
   *  1. `status` — serverdan kelgan holat (bloklangan/muddati tugagan).
   *  2. `effectiveEndsAt` + MONOTON vaqt — `club.isExpired` ataylab
   *     ISHLATILMAYDI: u javob KESHLANGAN PAYTDAGI qiymat va oflaynda
   *     abadiy `false` bo'lib qolardi. Muddat esa shu yerda, hozirgi
   *     (orqaga surib bo'lmaydigan) vaqt bilan qayta hisoblanadi.
   *  3. `offlineLicense` — serverning IMZOLANGAN ruxsatnomasi. IndexedDB
   *     dagi keshni tahrirlab (2) ni chetlab o'tishga urinilsa, imzo mos
   *     kelmaydi va bu qatlam baribir bloklaydi.
   */
  if (subscriptionLocked) return <Navigate to="/locked" replace />;
  if (user.role === 'superadmin' && offlineAccess) return <Navigate to="/locked" replace />;

  // Superadmin klub ichini ko'rayotganda klub sahifalari ochiq —
  // server 403 qaytaradigan sahifalar (blocklist) bundan mustasno
  if (user.role === 'superadmin' && viewingClub.get()) {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (SUPERADMIN_VIEW_BLOCKED.includes(path)) {
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (roles && !hasRole(...roles)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <>{children}</>;
};

const App = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  // `/?landing` — tizimga kirgan foydalanuvchi ham saytni ko'ra olsin
  // (klub egasi sahifani tanishiga ulashishdan oldin ko'rib chiqadi)
  const showLanding = new URLSearchParams(location.search).has('landing');
  // O'rnatilgan dastur (Windows/Android) sayt emas: reklama sahifasi o'rniga
  // to'g'ridan-to'g'ri kirish yoki ish ekrani ochiladi
  const inAppShell = isAppShell();
  /** Dastur ichida sayt sahifalari o'rniga: kirgan bo'lsa ish joyi, aks holda kirish */
  const appEntry = loading ? (
    <FullScreenSpin />
  ) : (
    <Navigate to={user ? homeFor(user.role) : '/login'} replace />
  );

  return (
    <Suspense fallback={<FullScreenSpin />}>
      <Routes>
        {/* Ommaviy sahifalar */}
        <Route
          path="/"
          element={
            inAppShell ? (
              appEntry
            ) : loading ? (
              <FullScreenSpin />
            ) : user && !showLanding ? (
              <Navigate to={homeFor(user.role)} replace />
            ) : (
              <Landing />
            )
          }
        />
        <Route
          path="/register"
          element={
            inAppShell ? (
              appEntry
            ) : !loading && user ? (
              <Navigate to={homeFor(user.role)} replace />
            ) : (
              <Register />
            )
          }
        />
        <Route
          path="/login"
          element={!loading && user ? <Navigate to={homeFor(user.role)} replace /> : <Login />}
        />
        {/* Desktop dasturni yuklab olish — ATAYLAB autentifikatsiyasiz va
            login holatidan qat'i nazar ochiq: yangi kassa kompyuteriga
            dasturni o'rnatayotgan odam hali tizimga kira olmagan bo'ladi. */}
        {/* Dastur ichida yuklab olish sahifasi kerak emas: Windows o'zi
            yangilanadi, Android yangilanishni banner orqali taklif qiladi */}
        <Route path="/download" element={inAppShell ? appEntry : <Download />} />
        <Route path="/locked" element={<Locked />} />

        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          {/* Superadmin paneli */}
          <Route
            path="/admin"
            element={
              <Protected roles={['superadmin']}>
                <AdminDashboard />
              </Protected>
            }
          />
          <Route
            path="/admin/clubs"
            element={
              <Protected roles={['superadmin']}>
                <AdminClubsPage />
              </Protected>
            }
          />
          {/* Klub ma'lumotlari konsoli — FAQAT O'QISH, impersonatsiyasiz
              (viewingClub konteksti o'zgarmaydi) */}
          <Route
            path="/admin/clubs/:id/data"
            element={
              <Protected roles={['superadmin']}>
                <AdminClubData />
              </Protected>
            }
          />
          {/* Desktop relizlari — o'rnatgichlarni yuklash va nashr qilish */}
          <Route
            path="/admin/releases"
            element={
              <Protected roles={['superadmin']}>
                <AdminReleases />
              </Protected>
            }
          />
          <Route
            path="/admin/billing"
            element={
              <Protected roles={['superadmin']}>
                <AdminBilling />
              </Protected>
            }
          />
          <Route
            path="/admin/feedback"
            element={
              <Protected roles={['superadmin']}>
                <AdminFeedback />
              </Protected>
            }
          />
          {/* Landing arizalari — savdo voronkasi */}
          <Route
            path="/admin/leads"
            element={
              <Protected roles={['superadmin']}>
                <AdminLeads />
              </Protected>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <Protected roles={['superadmin']}>
                <AdminNotifications />
              </Protected>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <Protected roles={['superadmin']}>
                <AdminLogs />
              </Protected>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <Protected roles={['superadmin']}>
                <AdminSettings />
              </Protected>
            }
          />

          {/* Klub sahifalari */}
          <Route
            path="/dashboard"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Dashboard />
              </Protected>
            }
          />
          {/* Rol ro'yxati shart: aks holda ko'rish rejimidan tashqaridagi
              superadmin bu sahifalarga tushib, 403 lar bilan qolib ketadi */}
          <Route
            path="/tables"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Tables />
              </Protected>
            }
          />
          <Route
            path="/sessions"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Sessions />
              </Protected>
            }
          />
          <Route
            path="/orders"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Orders />
              </Protected>
            }
          />
          <Route
            path="/products"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Products />
              </Protected>
            }
          />
          <Route
            path="/debts"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Debts />
              </Protected>
            }
          />
          <Route
            path="/reports"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Reports />
              </Protected>
            }
          />
          <Route
            path="/customers"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Customers />
              </Protected>
            }
          />
          <Route
            path="/reservations"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Reservations />
              </Protected>
            }
          />
          <Route
            path="/game"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <BilliardGame />
              </Protected>
            }
          />
          <Route
            path="/expenses"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Expenses />
              </Protected>
            }
          />
          {/* Kassa smenasi va Z-hisobot */}
          <Route
            path="/shifts"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Shifts />
              </Protected>
            }
          />
          <Route
            path="/feedback"
            element={
              <Protected roles={['admin', 'kassir', 'operator']}>
                <Feedback />
              </Protected>
            }
          />
          <Route
            path="/notifications"
            element={
              <Protected roles={['admin']}>
                <Notifications />
              </Protected>
            }
          />
          <Route
            path="/subscription"
            element={
              <Protected roles={['admin']}>
                <Subscription />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected roles={['superadmin', 'admin', 'kassir', 'operator']}>
                <Profile />
              </Protected>
            }
          />
          <Route
            path="/staff"
            element={
              <Protected roles={['admin']}>
                <Staff />
              </Protected>
            }
          />
          <Route
            path="/settings"
            element={
              <Protected roles={['admin']}>
                <Settings />
              </Protected>
            }
          />

          {/* 404 — jimgina bosh sahifaga otib yubormaydi */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
