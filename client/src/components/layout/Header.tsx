import { useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Layout,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CrownOutlined,
  DesktopOutlined,
  EyeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { viewingClub } from '../../api/client';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { ROLE_TAG_COLORS } from '../../constants';
import { isDesktop } from '../../offline/desktop';
import { TOKENS } from '../../theme/tokens';
import NotificationsBell from '../ui/NotificationsBell';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Buyruq panelini (Ctrl+K) ochish — planshet uchun teginiladigan yo'l */
  onOpenSearch?: () => void;
  /** Klaviatura yorliqlari yordamini ochish */
  onOpenHelp?: () => void;
}

const Header = ({ collapsed, onToggle, onOpenSearch, onOpenHelp }: HeaderProps) => {
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

  /**
   * Obuna tugashigacha qolgan vaqt (kun + soat) — headerda profil yonida.
   * `now` har 30 s da yangilanadi, shu bois hisob jonli ko'rinadi.
   */
  const endMs = club?.effectiveEndsAt ? new Date(club.effectiveEndsAt).getTime() : null;
  const canOpenSub = user?.role === 'admin';
  const sub = (() => {
    if (endMs === null || user?.role === 'superadmin') return null;
    const statusWord = club?.status === 'trial' ? t('club.trial') : t('club.active');
    const msLeft = endMs - now.valueOf();
    if (msLeft <= 0) {
      return { color: 'red', short: t('club.expired'), full: t('club.expired'), statusWord };
    }
    const totalHours = Math.floor(msLeft / 3_600_000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const mins = Math.floor((msLeft % 3_600_000) / 60_000);
    const full =
      days >= 1
        ? `${days} ${t('common.days')} ${hours} ${t('common.hours')}`
        : hours >= 1
          ? `${hours} ${t('common.hours')} ${mins} ${t('common.minutes')}`
          : `${mins} ${t('common.minutes')}`;
    const short = days >= 1 ? `${days} ${t('common.days')}` : `${hours} ${t('common.hours')}`;
    const color = days > 7 ? 'green' : days > 2 ? 'gold' : days >= 1 ? 'orange' : 'red';
    return { color, short, full, statusWord };
  })();

  return (
    <AntHeader
      className="workspace-header"
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
      <div className="workspace-header__identity">
        <Button
          type="text"
          aria-label={t('btn.menu')}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
        {!viewing && (
          <div className="workspace-header__club">
            <Text strong ellipsis>{club?.name || t('appName')}</Text>
            <span>{t('workspace.controlRoom')}{screens.lg && ` · ${now.format('DD.MM.YYYY')}`}</span>
          </div>
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
            style={{ fontWeight: 600, maxWidth: 160, display: 'inline-flex', alignItems: 'center' }}
            icon={<EyeOutlined />}
          >
            {/* Uzun klub nomi header amallarini ekrandan chiqarib yubormasin */}
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {viewing.name}
            </span>
          </Tag>
        )}
      </div>

      <div className="workspace-header__tools">
        {onOpenSearch && (
          <Tooltip title={`${t('search.button')} (Ctrl+K)`}>
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={onOpenSearch}
              aria-label={t('search.button')}
              className="workspace-search-trigger"
            >
              {screens.md !== false && (
                <><span>{t('workspace.search')}</span><kbd>Ctrl K</kbd></>
              )}
            </Button>
          </Tooltip>
        )}
        <Segmented
          className="workspace-header__language"
          size="small"
          value={lang}
          onChange={(value) => setLang(value as 'uz' | 'ru')}
          options={[
            { label: "O'z", value: 'uz' },
            { label: 'Ру', value: 'ru' },
          ]}
        />
        {sub && (
          <Tooltip title={`${sub.statusWord} · ${sub.full}`}>
            <Tag
              className="workspace-header__subscription"
              color={sub.color}
              icon={<CrownOutlined />}
              onClick={canOpenSub ? () => navigate('/subscription') : undefined}
              // Klaviatura/skrinrider ham obuna pilyulasidan billingga o'ta olsin
              role={canOpenSub ? 'button' : undefined}
              tabIndex={canOpenSub ? 0 : undefined}
              aria-label={canOpenSub ? `${sub.statusWord} · ${sub.full}` : undefined}
              onKeyDown={
                canOpenSub
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate('/subscription');
                      }
                    }
                  : undefined
              }
              style={{
                margin: 0,
                fontWeight: 600,
                cursor: canOpenSub ? 'pointer' : 'default',
              }}
            >
              {screens.md !== false ? sub.full : sub.short}
            </Tag>
          </Tooltip>
        )}
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
                {
                  key: 'language',
                  label: lang === 'uz' ? 'Русский' : 'O‘zbekcha',
                  onClick: () => setLang(lang === 'uz' ? 'ru' : 'uz'),
                },
                ...(sub && canOpenSub ? [{
                  key: 'subscription',
                  icon: <CrownOutlined />,
                  label: `${t('menu.subscription')} · ${sub.full}`,
                  onClick: () => navigate('/subscription'),
                }] : []),
                // Desktop qobiqda YASHIRILADI: u yerda dastur allaqachon
                // o'rnatilgan va o'zi yangilanadi — "yuklab olish" bandi
                // faqat chalg'itardi.
                ...(isDesktop()
                  ? []
                  : [
                      {
                        key: 'download',
                        icon: <DesktopOutlined />,
                        label: t('menu.download'),
                        onClick: () => navigate('/download'),
                      },
                    ]),
                ...(onOpenHelp
                  ? [
                      {
                        key: 'help',
                        icon: <QuestionCircleOutlined />,
                        label: t('help.button'),
                        onClick: onOpenHelp,
                      },
                    ]
                  : []),
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
            <Button type="text" icon={<UserOutlined />} aria-label={t('menu.profile')}>
              {screens.lg !== false && (
                <Space size={6}>
                  <span className="workspace-header__username">{user.name}</span>
                  <Tag color={ROLE_TAG_COLORS[user.role]} style={{ marginInlineEnd: 0 }}>
                    {t(`role.${user.role}`)}
                  </Tag>
                </Space>
              )}
            </Button>
          </Dropdown>
        )}
      </div>
    </AntHeader>
  );
};

export default Header;
