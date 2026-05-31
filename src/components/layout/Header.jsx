import React from 'react';
import { Layout, Button, Dropdown, Avatar, Space, Switch, Typography, Badge, Tag } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined,
  MoonOutlined, SunOutlined, BellOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import dayjs from 'dayjs';

const { Header } = Layout;
const { Text } = Typography;

const roleColors = { admin: '#faad14', kassir: '#1890ff', operator: '#8c8c8c' };
const roleLabels = { admin: 'Admin', kassir: 'Kassir', operator: 'Operator' };

const AppHeader = ({ collapsed, setCollapsed }) => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  const userMenuItems = [
    {
      key: 'info',
      disabled: true,
      label: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.name}</div>
          <Tag color={roleColors[user?.role]} style={{ marginTop: 4, fontSize: 11 }}>
            {roleLabels[user?.role]}
          </Tag>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Tizimdan chiqish',
      danger: true,
    },
  ];

  return (
    <Header style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          style={{ fontSize: 18, width: 40, height: 40 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }}>
          <ClockCircleOutlined />
          <Text style={{ fontSize: 13 }}>{dayjs().format('HH:mm — DD.MM.YYYY')}</Text>
        </div>
      </div>

      {/* Right side */}
      <Space size={16} align="center">
        {/* Theme toggle */}
        <Switch
          checkedChildren={<MoonOutlined />}
          unCheckedChildren={<SunOutlined />}
          checked={isDarkMode}
          onChange={toggleTheme}
        />

        {/* User dropdown */}
        <Dropdown
          menu={{ items: userMenuItems, onClick: (e) => e.key === 'logout' && logout() }}
          placement="bottomRight"
          arrow
        >
          <Space style={{ cursor: 'pointer', padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(250,173,20,0.2)', background: 'rgba(250,173,20,0.05)' }}>
            <Avatar
              size={32}
              style={{ background: roleColors[user?.role] || '#faad14', fontWeight: 700 }}
            >
              {user?.name?.charAt(0)?.toUpperCase()}
            </Avatar>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: roleColors[user?.role], opacity: 0.9 }}>
                {roleLabels[user?.role]}
              </div>
            </div>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppHeader;
