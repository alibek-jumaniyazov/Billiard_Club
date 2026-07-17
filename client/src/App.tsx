import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
const AdminClubs = lazy(() => import('./pages/AdminClubs'));

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
 * Himoyalangan marshrut:
 *  1) autentifikatsiya
 *  2) obuna holati (muddati tugagan/bloklangan klub -> /locked)
 *  3) rol tekshiruvi (superadmin "klubni ko'rish" rejimida klub sahifalariga kira oladi)
 */
const Protected = ({ roles, children }: { roles?: UserRole[]; children: ReactNode }) => {
  const { user, club, loading, hasRole } = useAuth();

  if (loading) return <FullScreenSpin />;
  if (!user) return <Navigate to="/login" replace />;

  const clubLocked =
    user.role !== 'superadmin' &&
    club &&
    (club.status === 'blocked' || club.status === 'expired' || club.isExpired);
  if (clubLocked) return <Navigate to="/locked" replace />;

  // Superadmin klub ichini ko'rayotganda barcha klub sahifalari ochiq
  if (user.role === 'superadmin' && viewingClub.get()) return <>{children}</>;

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
                <AdminClubs />
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
