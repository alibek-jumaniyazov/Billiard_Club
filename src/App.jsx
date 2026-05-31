import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Spin } from 'antd';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tables from './pages/Tables';
import Sessions from './pages/Sessions';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Reports from './pages/Reports';
import Staff from './pages/Staff';
import Debts from './pages/Debts';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="Tizimga ulanmoqda..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="tables" element={<Tables />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
        
        {/* Admin and Kassir routes */}
        <Route 
          path="reports" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'kassir']}>
              <Reports />
            </ProtectedRoute>
          } 
        />
        
        {/* Admin only routes */}
        <Route 
          path="staff" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Staff />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="debts" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Debts />
            </ProtectedRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
