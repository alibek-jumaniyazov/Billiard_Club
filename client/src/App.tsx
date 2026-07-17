import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/layout/AppLayout';
import { viewingClub } from './api/client';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './types';
import Login from './pages/Login';
import Locked from './pages/Locked';
import NotFound from './pages/NotFound';

const Landing = lazy(() => import('./pages/Landing'));
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
const Reservations = lazy(() => import('./pages/Reservations'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminClubsPage = lazy(() => import('./pages/admin/AdminClubsPage'));
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

const FullScreenSpin = () => (
  <div
    style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Spin size="large" />
  </div>
);

/** Autentifikatsiya qilingan foydalanuvchining "bosh sahifasi" */
const homeFor = (role: UserRole): string => (role === 'superadmin' ? '/admin' : '/dashboard');

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
  const { user, club, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenSpin />;
  if (!user) return <Navigate to="/login" replace />;

  const clubLocked =
    user.role !== 'superadmin' &&
    club &&
    (club.status === 'blocked' || club.status === 'expired' || club.isExpired);
  if (clubLocked) return <Navigate to="/locked" replace />;

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

  return (
    <Suspense fallback={<FullScreenSpin />}>
      <Routes>
        {/* Ommaviy sahifalar */}
        <Route
          path="/"
          element={
            loading ? (
              <FullScreenSpin />
            ) : user ? (
              <Navigate to={homeFor(user.role)} replace />
            ) : (
              <Landing />
            )
          }
        />
        <Route
          path="/register"
          element={
            !loading && user ? <Navigate to={homeFor(user.role)} replace /> : <Register />
          }
        />
        <Route
          path="/login"
          element={!loading && user ? <Navigate to={homeFor(user.role)} replace /> : <Login />}
        />
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
              <Protected roles={['admin', 'kassir', 'operator']}>
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
            path="/expenses"
            element={
              <Protected roles={['admin', 'kassir']}>
                <Expenses />
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
