import { useMemo } from 'react';
import { Layout, Menu, theme, Typography } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  CoffeeOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  HistoryOutlined,
  SettingOutlined,
  ShopOutlined,
  TableOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { viewingClub } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ROLE_COLORS } from '../../constants';

const { Sider } = Layout;
const { Text } = Typography;

interface SidebarProps {
  collapsed: boolean;
}

const Sidebar = ({ collapsed }: SidebarProps) => {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const viewing = viewingClub.get();
  const isSuperadmin = hasRole('superadmin');

  const items = useMemo(() => {
    // Superadmin: klub ichini ko'rmayotganda faqat klublar menyusi
    if (isSuperadmin && !viewing) {
      return [
        { key: '/admin', icon: <ShopOutlined />, label: t('menu.clubs') },
      ];
    }

    const groups = [
      // Superadmin ko'rish rejimida — panelga qaytish bandi eng tepada
      ...(isSuperadmin
        ? [
            {
              key: 'g-back',
              type: 'group' as const,
              label: null,
              children: [
                { key: '/admin', icon: <ShopOutlined />, label: t('menu.clubs') },
              ],
            },
          ]
        : []),
      {
        key: 'g-billiard',
        type: 'group' as const,
        label: collapsed ? null : t('menu.groupBilliard'),
        children: [
          { key: '/dashboard', icon: <DashboardOutlined />, label: t('menu.dashboard') },
          { key: '/tables', icon: <TableOutlined />, label: t('menu.tables') },
          { key: '/sessions', icon: <HistoryOutlined />, label: t('menu.sessions') },
        ],
      },
      {
        key: 'g-bar',
        type: 'group' as const,
        label: collapsed ? null : t('menu.groupBar'),
        children: [
          { key: '/products', icon: <AppstoreOutlined />, label: t('menu.products') },
          { key: '/orders', icon: <CoffeeOutlined />, label: t('menu.orders') },
        ],
      },
    ];

    if (hasRole('admin', 'kassir') || (isSuperadmin && viewing)) {
      groups.push({
        key: 'g-reports',
        type: 'group' as const,
        label: collapsed ? null : t('menu.groupReports'),
        children: [
          { key: '/reports', icon: <BarChartOutlined />, label: t('menu.reports') },
          { key: '/debts', icon: <CreditCardOutlined />, label: t('menu.debts') },
        ],
      });
    }

    if (hasRole('admin') || (isSuperadmin && viewing)) {
      groups.push({
        key: 'g-management',
        type: 'group' as const,
        label: collapsed ? null : t('menu.groupManagement'),
        children: [
          { key: '/staff', icon: <TeamOutlined />, label: t('menu.staff') },
          { key: '/settings', icon: <SettingOutlined />, label: t('menu.settings') },
        ],
      });
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, hasRole, t, isSuperadmin, viewing?.id]);

  const selectedKey =
    location.pathname === '/' ? '/dashboard' : `/${location.pathname.split('/')[1]}`;

  return (
    <Sider
      width={240}
      collapsed={collapsed}
      collapsedWidth={72}
      style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: collapsed ? '16px 0' : '16px 20px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #faad14, #d48806)',
            color: '#111',
            fontSize: 20,
          }}
        >
          <TrophyOutlined />
        </div>
        {!collapsed && (
          <div style={{ lineHeight: 1.2 }}>
            <Text strong style={{ fontSize: 15, display: 'block' }}>
              PRIME BILLIARD
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t(`role.${user?.role ?? 'operator'}`)}
            </Text>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={({ key }) => {
            // Superadmin klublar paneliga qaytsa — ko'rish rejimi tugaydi
            if (key === '/admin') viewingClub.clear();
            navigate(key);
          }}
          style={{ borderInlineEnd: 'none', background: 'transparent' }}
        />
      </div>

      {!collapsed && user && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: ROLE_COLORS[user.role],
              color: '#111',
              fontWeight: 700,
            }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>
              {user.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              @{user.username}
            </Text>
          </div>
        </div>
      )}
    </Sider>
  );
};

export default Sidebar;
