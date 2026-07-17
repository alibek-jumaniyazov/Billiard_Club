import { useMemo } from 'react';
import { Layout, Menu, theme, Typography } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  CoffeeOutlined,
  CommentOutlined,
  ContactsOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  NotificationOutlined,
  PieChartOutlined,
  SettingOutlined,
  ShopOutlined,
  TableOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { viewingClub } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ROLE_COLORS } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import { BrandLogo } from '../ui';

const { Sider } = Layout;
const { Text } = Typography;

interface SidebarProps {
  collapsed: boolean;
  /** true — mobil Drawer ichida (sticky/height o'chiriladi) */
  inDrawer?: boolean;
  /** Menyu bandi bosilganda chaqiriladi (mobil Drawerni yopish uchun) */
  onNavigate?: () => void;
}

const Sidebar = ({ collapsed, inDrawer = false, onNavigate }: SidebarProps) => {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const viewing = viewingClub.get();
  const isSuperadmin = hasRole('superadmin');

  const items = useMemo(() => {
    // Superadmin: klub ichini ko'rmayotganda — to'liq platforma menyusi
    if (isSuperadmin && !viewing) {
      return [
        {
          key: 'g-platform',
          type: 'group' as const,
          label: collapsed ? null : t('menu.groupPlatform'),
          children: [
            { key: '/admin', icon: <PieChartOutlined />, label: t('menu.adminDashboard') },
            { key: '/admin/clubs', icon: <ShopOutlined />, label: t('menu.clubs') },
            { key: '/admin/billing', icon: <DollarOutlined />, label: t('menu.adminBilling') },
            { key: '/admin/feedback', icon: <CommentOutlined />, label: t('menu.adminFeedback') },
            {
              key: '/admin/notifications',
              icon: <NotificationOutlined />,
              label: t('menu.adminNotifications'),
            },
            { key: '/admin/logs', icon: <FileSearchOutlined />, label: t('menu.adminLogs') },
            { key: '/admin/settings', icon: <SettingOutlined />, label: t('menu.adminSettings') },
          ],
        },
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
          { key: '/reservations', icon: <CalendarOutlined />, label: t('menu.reservations') },
        ],
      },
      {
        key: 'g-crm',
        type: 'group' as const,
        label: collapsed ? null : t('menu.groupCrm'),
        children: [
          { key: '/customers', icon: <ContactsOutlined />, label: t('menu.customers') },
          // Server superadminni klub /feedback ga kiritmaydi (403) —
          // ko'rish rejimida bandni yashiramiz
          ...(isSuperadmin && viewing
            ? []
            : [{ key: '/feedback', icon: <CommentOutlined />, label: t('menu.feedback') }]),
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
          { key: '/expenses', icon: <WalletOutlined />, label: t('menu.expenses') },
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
          // /notifications va /subscription ham superadmin uchun serverda 403
          ...(isSuperadmin && viewing
            ? []
            : [
                { key: '/notifications', icon: <BellOutlined />, label: t('menu.notifications') },
                { key: '/subscription', icon: <CrownOutlined />, label: t('menu.subscription') },
              ]),
          { key: '/settings', icon: <SettingOutlined />, label: t('menu.settings') },
        ],
      });
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, hasRole, t, isSuperadmin, viewing?.id]);

  // /admin/* sahifalarida to'liq yo'l tanlanadi; klub sahifalarida birinchi segment
  const selectedKey = location.pathname.startsWith('/admin')
    ? location.pathname.replace(/\/+$/, '') || '/admin'
    : location.pathname === '/'
      ? '/dashboard'
      : `/${location.pathname.split('/')[1]}`;

  return (
    <Sider
      className="app-sider"
      width={inDrawer ? '100%' : 240}
      collapsed={inDrawer ? false : collapsed}
      collapsedWidth={72}
      breakpoint={inDrawer ? undefined : 'lg'}
      style={{
        ...(inDrawer
          ? { height: '100%' }
          : { position: 'sticky', top: 0, height: '100vh' }),
        display: 'flex',
        flexDirection: 'column',
        borderRight: inDrawer ? 'none' : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: collapsed && !inDrawer ? '16px 0' : '16px 18px',
          justifyContent: collapsed && !inDrawer ? 'center' : 'flex-start',
        }}
      >
        <BrandLogo size={38} withWordmark={!collapsed || inDrawer} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={({ key }) => {
            // Superadmin platforma paneliga qaytsa — ko'rish rejimi tugaydi
            if (String(key).startsWith('/admin')) viewingClub.clear();
            navigate(String(key));
            onNavigate?.();
          }}
          style={{ borderInlineEnd: 'none', background: 'transparent' }}
        />
      </div>

      {(!collapsed || inDrawer) && user && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '10px 16px',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              background: ROLE_COLORS[user.role],
              color: TOKENS.color.gold.contrast,
              fontWeight: 700,
            }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
            <Text strong ellipsis style={{ display: 'block', fontSize: 12.5 }}>
              {user.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t(`role.${user.role}`)}
            </Text>
          </div>
        </div>
      )}
    </Sider>
  );
};

export default Sidebar;
