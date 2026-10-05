import { CalendarOutlined, CoffeeOutlined, DashboardOutlined, MoreOutlined, ShopOutlined, TableOutlined } from '@ant-design/icons';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { viewingClub } from '../../api/client';

export default function MobileNavigation({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const platform = hasRole('superadmin') && !viewingClub.get();
  const items = platform
    ? [
        { to: '/admin', label: 'menu.adminDashboard', icon: <DashboardOutlined /> },
        { to: '/admin/clubs', label: 'menu.clubs', icon: <ShopOutlined /> },
      ]
    : [
        ...(hasRole('admin', 'kassir', 'superadmin')
          ? [{ to: '/dashboard', label: 'workspace.overview', icon: <DashboardOutlined /> }]
          : []),
        { to: '/tables', label: 'menu.tables', icon: <TableOutlined /> },
        { to: '/orders', label: 'menu.orders', icon: <CoffeeOutlined /> },
        { to: '/reservations', label: 'menu.reservations', icon: <CalendarOutlined /> },
      ];
  return (
    <nav className="mobile-navigation" aria-label={t('workspace.navigation')}>
      {items.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} end className={({ isActive }) => isActive ? 'mobile-navigation__item is-active' : 'mobile-navigation__item'}>
          {icon}<span>{t(label)}</span>
        </NavLink>
      ))}
      <button type="button" className="mobile-navigation__item" onClick={onOpenMenu} aria-expanded={menuOpen}>
        <MoreOutlined /><span>{t('workspace.more')}</span>
      </button>
    </nav>
  );
}
