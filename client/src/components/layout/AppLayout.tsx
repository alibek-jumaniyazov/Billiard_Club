import { useEffect, useState } from 'react';
import { Drawer, Grid, Layout } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '../ErrorBoundary';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNavigation from './MobileNavigation';
import CommandPalette from '../ui/CommandPalette';
import ConnectionBanner from '../ui/ConnectionBanner';
import NativeUpdateBanner from '../ui/NativeUpdateBanner';
import ShortcutsHelp from '../ui/ShortcutsHelp';
import { NotificationsProvider } from '../../context/NotificationsContext';
import { TOKENS } from '../../theme/tokens';
import '../../styles/workspace.css';

const { Content } = Layout;

/**
 * Marshrut -> tab sarlavhasi i18n kaliti (mavjud `menu.*` yorliqlaridan). Avval
 * autentifikatsiyalangan sahifalar tab sarlavhasini UMUMAN qo'ymasdi — hamma tab
 * bir xil statik nom bilan turardi va kassir /stollar tabini /hisobotdan ajrata
 * olmasdi. Xaritada yo'q marshrutlar (masalan /game o'z to'liq sarlavhasini
 * useDocumentHead bilan o'zi qo'yadi, NotFound) tegilmaydi.
 */
const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/dashboard': 'menu.dashboard',
  '/tables': 'menu.tables',
  '/sessions': 'menu.sessions',
  '/orders': 'menu.orders',
  '/products': 'menu.products',
  '/debts': 'menu.debts',
  '/reports': 'menu.reports',
  '/customers': 'menu.customers',
  '/reservations': 'menu.reservations',
  '/expenses': 'menu.expenses',
  '/shifts': 'menu.shifts',
  '/feedback': 'menu.feedback',
  '/notifications': 'menu.notifications',
  '/subscription': 'menu.subscription',
  '/profile': 'menu.profile',
  '/staff': 'menu.staff',
  '/settings': 'menu.settings',
  '/admin': 'menu.adminDashboard',
  '/admin/clubs': 'menu.clubs',
  '/admin/releases': 'menu.adminReleases',
  '/admin/billing': 'menu.adminBilling',
  '/admin/feedback': 'menu.adminFeedback',
  '/admin/leads': 'menu.adminLeads',
  '/admin/notifications': 'menu.adminNotifications',
  '/admin/logs': 'menu.adminLogs',
  '/admin/settings': 'menu.adminSettings',
};

/**
 * Ilova qobig'i — moslashuvchan:
 *  - lg va undan keng: yopishqoq Sider (yig'ish tugmasi Headerda)
 *  - lg dan tor (mobil): Sider yashirin, menyu chapdan Drawer bo'lib ochiladi
 */
const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  // Birinchi renderda screens bo'sh — desktop deb qaraladi (sakrashning oldini oladi)
  const isMobile = screens.lg === false;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Global yorliqlar: Ctrl/Cmd+K — buyruq paneli; ? — yorliqlar yordami.
  // '?' matn maydonida yozilsa ochilmasin (Ctrl+K modifikator bo'lgani uchun
  // himoya shart emas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        const typing =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
        if (typing) return;
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Tab sarlavhasi joriy marshrut + tilga qarab yangilanadi ("<Sahifa> — Billiard
  // Club"). Til almashsa ham qayta o'rnatiladi (i18n.language bog'liqligi).
  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const key =
      ROUTE_TITLE_KEYS[path] ??
      (path.startsWith('/admin/clubs') ? 'adminClubData.title' : null);
    if (key) document.title = `${t(key)} — ${t('appName')}`;
  }, [location.pathname, t, i18n.language]);

  return (
    /* Xabarnomalar holati SHU YERDA: header qo'ng'irog'i ham, /notifications
       sahifasi ham shu qobiq ichida — ikkalasi bitta manbadan o'qiydi */
    <NotificationsProvider>
      <Layout className="workspace-shell" style={{ minHeight: '100dvh' }}>
        <a className="skip-link" href="#workspace-main">{t('workspace.skipContent')}</a>
        {!isMobile && <Sidebar collapsed={collapsed} />}

        {isMobile && (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={296}
            title={t('workspace.navigation')}
            styles={{
              body: { padding: 0, background: TOKENS.color.bg.bg1 },
              content: { background: TOKENS.color.bg.bg1 },
            }}
          >
            <Sidebar collapsed={false} inDrawer onNavigate={() => setDrawerOpen(false)} />
          </Drawer>
        )}

        {/* isolation: aurora z-index'i qatlamdan tashqariga (modal/drawer) chiqmasin */}
        <Layout style={{ position: 'relative', isolation: 'isolate', minWidth: 0 }}>
          <Header
            collapsed={isMobile ? !drawerOpen : collapsed}
            onToggle={() =>
              isMobile ? setDrawerOpen((open) => !open) : setCollapsed((c) => !c)
            }
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
          />
          {/* Ulanish/sinxronizatsiya holati — faqat aytadigan gap bo'lganda
              ko'rinadi, normal ish holatida ekran toza qoladi */}
          <ConnectionBanner />
          {/* Android ilova (APK) eskirgan bo'lsa — bir martalik yangilash taklifi */}
          <NativeUpdateBanner />
          <Content id="workspace-main" tabIndex={-1} className="page-container" style={{ position: 'relative', zIndex: 1 }}>
            {/* Sahifa darajasidagi xato chegarasi: bitta sahifadagi render
                xatosi yon menyu va sarlavhani O'LDIRMAYDI — kassir boshqa
                sahifaga o'tib ishini davom ettiradi. `location.key` o'zgarganda
                holat o'zi tiklanadi (ErrorBoundary izohiga qarang) */}
            <ErrorBoundary inRoute resetKey={location.key}>
              <Outlet />
            </ErrorBoundary>
          </Content>
          {isMobile && <MobileNavigation onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} />}
        </Layout>
      </Layout>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </NotificationsProvider>
  );
};

export default AppLayout;
