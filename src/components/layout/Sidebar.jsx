import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  DashboardOutlined,
  TableOutlined,
  PlayCircleOutlined,
  CoffeeOutlined,
  ShoppingCartOutlined,
  BarChartOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

const Sidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasRole } = useAuth();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Bosh sahifa',
    },
    {
      key: '/tables',
      icon: <TableOutlined />,
      label: 'Stollar',
    },
    {
      key: '/sessions',
      icon: <PlayCircleOutlined />,
      label: "O'yinlar",
    },
    {
      key: '/products',
      icon: <CoffeeOutlined />,
      label: 'Bar',
    },
    {
      key: '/orders',
      icon: <ShoppingCartOutlined />,
      label: 'Buyurtmalar',
    },
  ];

  if (hasRole(['admin', 'kassir'])) {
    menuItems.push({
      key: '/reports',
      icon: <BarChartOutlined />,
      label: 'Hisobotlar',
    });
  }

  if (hasRole(['admin'])) {
    menuItems.push(
      {
        key: '/staff',
        icon: <TeamOutlined />,
        label: 'Xodimlar',
      },
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: 'Sozlamalar',
      }
    );
  }

  return (
    <Sider trigger={null} collapsible collapsed={collapsed} width={250} className="app-sidebar">
      <div 
        style={{ 
          height: '64px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '16px'
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--primary-color)', fontSize: collapsed ? '14px' : '20px', transition: 'all 0.3s' }}>
          {collapsed ? 'PB' : 'Prime Billiard'}
        </h2>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};

export default Sidebar;
