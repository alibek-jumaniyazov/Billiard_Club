import React from 'react';
import { Layout, Button, Dropdown, Avatar, Space, Switch } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const { Header } = Layout;

const AppHeader = ({ collapsed, setCollapsed }) => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  const handleMenuClick = (e) => {
    if (e.key === 'logout') {
      logout();
    }
  };

  const userMenuItems = [
    {
      key: 'info',
      disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 'bold' }}>{user?.name}</div>
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>
            {user?.role}
          </div>
        </div>
      ),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Tizimdan chiqish',
      danger: true,
    },
  ];

  return (
    <Header>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          style={{ fontSize: '16px', width: 64, height: 64 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <Switch 
          checkedChildren={<MoonOutlined />} 
          unCheckedChildren={<SunOutlined />} 
          checked={isDarkMode} 
          onChange={toggleTheme} 
        />
        <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight" arrow>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar style={{ backgroundColor: 'var(--primary-color)' }} icon={<UserOutlined />} />
            <span style={{ fontWeight: 500 }} className="hidden-mobile">{user?.name}</span>
          </Space>
        </Dropdown>
      </div>
    </Header>
  );
};

export default AppHeader;
