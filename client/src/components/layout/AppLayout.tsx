import { useEffect, useState } from 'react';
import { Drawer, Grid, Layout } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '../ErrorBoundary';
import Header from './Header';
import Sidebar from './Sidebar';
import AnimatedBackground from '../ui/AnimatedBackground';
import ConnectionBanner from '../ui/ConnectionBanner';
import { NotificationsProvider } from '../../context/NotificationsContext';
import { TOKENS } from '../../theme/tokens';

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
  const screens = Grid.useBreakpoint();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  // Birinchi renderda screens bo'sh — desktop deb qaraladi (sakrashning oldini oladi)
  const isMobile = screens.lg === false;

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
      <Layout style={{ minHeight: '100vh' }}>
        {!isMobile && <Sidebar collapsed={collapsed} />}

        {isMobile && (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={264}
            closable={false}
            styles={{
              body: { padding: 0, background: TOKENS.color.bg.bg1 },
              content: { background: TOKENS.color.bg.bg1 },
            }}
          >
            <Sidebar collapsed={false} inDrawer onNavigate={() => setDrawerOpen(false)} />
          </Drawer>
        )}

        {/* isolation: aurora z-index'i qatlamdan tashqariga (modal/drawer) chiqmasin */}
        <Layout style={{ position: 'relative', isolation: 'isolate' }}>
          {/* Nozik aurora foni — kontent ORQASIDA suzadi (pointer-events: none, z-index: 0) */}
          <AnimatedBackground variant="subtle" />
          <Header
            collapsed={isMobile ? !drawerOpen : collapsed}
            onToggle={() =>
              isMobile ? setDrawerOpen((open) => !open) : setCollapsed((c) => !c)
            }
          />
          {/* Ulanish/sinxronizatsiya holati — faqat aytadigan gap bo'lganda
              ko'rinadi, normal ish holatida ekran toza qoladi */}
          <ConnectionBanner />
          <Content className="page-container" style={{ position: 'relative', zIndex: 1 }}>
            {/* Sahifa darajasidagi xato chegarasi: bitta sahifadagi render
                xatosi yon menyu va sarlavhani O'LDIRMAYDI — kassir boshqa
                sahifaga o'tib ishini davom ettiradi. `location.key` o'zgarganda
                holat o'zi tiklanadi (ErrorBoundary izohiga qarang) */}
            <ErrorBoundary inRoute resetKey={location.key}>
              <Outlet />
            </ErrorBoundary>
          </Content>
        </Layout>
      </Layout>
    </NotificationsProvider>
  );
};

export default AppLayout;
