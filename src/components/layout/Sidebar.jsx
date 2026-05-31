import React from 'react';
import { Layout, Menu, Badge, Avatar } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  DashboardOutlined, TableOutlined, PlayCircleOutlined, CoffeeOutlined,
  ShoppingCartOutlined, BarChartOutlined, TeamOutlined, SettingOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';

const { Sider } = Layout;

const Sidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasRole } = useAuth();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Bosh sahifa' },
    { type: 'divider' },
    {
      type: 'group',
      label: !collapsed ? 'Billiard' : '',
      children: [
        { key: '/tables', icon: <TableOutlined />, label: 'Stollar' },
        { key: '/sessions', icon: <PlayCircleOutlined />, label: "O'yinlar tarixi" },
      ]
    },
    {
      type: 'group',
      label: !collapsed ? 'Bar' : '',
      children: [
        { key: '/products', icon: <CoffeeOutlined />, label: 'Mahsulotlar' },
        { key: '/orders', icon: <ShoppingCartOutlined />, label: 'Buyurtmalar' },
      ]
    },
  ];

  if (hasRole(['admin', 'kassir'])) {
    menuItems.push({
      type: 'group',
      label: !collapsed ? 'Hisobot' : '',
      children: [
        { key: '/reports', icon: <BarChartOutlined />, label: 'Hisobotlar' },
      ]
    });
  }

  if (hasRole(['admin'])) {
    menuItems.push({
      type: 'group',
      label: !collapsed ? 'Boshqaruv' : '',
      children: [
        { key: '/staff', icon: <TeamOutlined />, label: 'Xodimlar' },
        { key: '/debts', icon: <SettingOutlined />, label: 'Qarzlar' },
      ]
    });
  }

  const roleColors = { admin: '#faad14', kassir: '#1890ff', operator: '#8c8c8c' };
  const roleLabels = { admin: 'Admin', kassir: 'Kassir', operator: 'Operator' };

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={240}
      style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0, left: 0 }}
    >
      {/* Logo */}
      <motion.div
        animate={{ padding: collapsed ? '16px 8px' : '20px 20px' }}
        transition={{ duration: 0.3 }}
        style={{
          borderBottom: '1px solid rgba(250, 173, 20, 0.2)',
          marginBottom: 8,
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, minWidth: 36,
            background: 'linear-gradient(135deg, #faad14, #d48806)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(250, 173, 20, 0.4)',
          }}>
            <TrophyOutlined style={{ color: '#000', fontSize: 18 }} />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ color: '#faad14', fontWeight: 800, fontSize: 15, letterSpacing: 0.5 }}>PRIME</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 1 }}>BILLIARD CLUB</div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0, background: 'transparent', padding: '0 8px' }}
      />

      {/* User badge at bottom */}
      {!collapsed && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Avatar
            size={32}
            style={{ background: roleColors[user?.role] || '#faad14', fontWeight: 700, minWidth: 32 }}
          >
            {user?.name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name}
            </div>
            <div style={{ color: roleColors[user?.role], fontSize: 11 }}>{roleLabels[user?.role]}</div>
          </div>
        </div>
        )}
    </Sider>
  );
};

export default Sidebar;
