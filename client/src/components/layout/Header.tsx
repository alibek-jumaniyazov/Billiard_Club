import { useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Layout,
  Segmented,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  EyeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { viewingClub } from '../../api/client';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { ROLE_TAG_COLORS } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import NotificationsBell from '../ui/NotificationsBell';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Header = ({ collapsed, onToggle }: HeaderProps) => {
  const { t } = useTranslation();
  const { lang, setLang } = useAppSettings();
  const { user, club, logout } = useAuth();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();

  // Jonli soat (avval bir marta render bo'lib qotib qolardi)
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Ko'rish rejimi belgisi faqat superadminga tegishli
  const viewing = user?.role === 'superadmin' ? viewingClub.get() : null;

  const handleLogout = async () => {
    viewingClub.clear();
    await logout();
    navigate('/login');
  };

  /** Obuna tugashiga oz qolganda ogohlantirish */
  const daysLeft = club?.effectiveEndsAt
    ? Math.ceil((new Date(club.effectiveEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <AntHeader
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        // Karbon glass yuzasi — Layout headerBg ataylab transparent;
        // rang to'g'ridan-to'g'ri bg0 tokenidan olinadi (palitra ko'tarilsa avtomatik ergashadi)
        background: `color-mix(in srgb, ${TOKENS.color.bg.bg0} 80%, transparent)`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
      }}
    >
      <Space size="middle">
        <Button
          type="text"
          aria-label="Menu"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
        {screens.sm !== false && (
          <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {now.format('HH:mm — DD.MM.YYYY')}
          </Text>
        )}
        {viewing && (
          <Tag
            color="purple"
            closable
            onClose={(e) => {
              e.preventDefault();
              viewingClub.clear();
              navigate('/admin');
            }}
            style={{ fontWeight: 600 }}
            icon={<EyeOutlined />}
          >
            {viewing.name}
          </Tag>
        )}
        {daysLeft !== null && daysLeft <= 5 && (
          <Tag color={daysLeft <= 2 ? 'red' : 'orange'}>
            {club?.status === 'trial' ? t('club.trial') : t('club.active')}: {daysLeft}{' '}
            {t('common.days')}
          </Tag>
        )}
      </Space>

      <Space size="middle">
        <Segmented
          size="small"
          value={lang}
          onChange={(value) => setLang(value as 'uz' | 'ru')}
          options={[
            { label: "O'z", value: 'uz' },
            { label: 'Ру', value: 'ru' },
          ]}
        />
        <NotificationsBell />
        {user && (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: t('menu.profile'),
                  onClick: () => navigate('/profile'),
                },
                { type: 'divider' as const },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t('btn.logout'),
                  danger: true,
                  onClick: handleLogout,
                },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<UserOutlined />}>
              {screens.md !== false && (
                <Space size={6}>
                  {user.name}
                  <Tag color={ROLE_TAG_COLORS[user.role]} style={{ marginInlineEnd: 0 }}>
                    {t(`role.${user.role}`)}
                  </Tag>
                </Space>
              )}
            </Button>
          </Dropdown>
        )}
      </Space>
    </AntHeader>
  );
};

export default Header;
