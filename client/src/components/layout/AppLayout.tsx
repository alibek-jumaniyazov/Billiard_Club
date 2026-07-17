import { useState } from 'react';
import { Drawer, Grid, Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { TOKENS } from '../../theme/tokens';

const { Content } = Layout;

/**
 * Ilova qobig'i — moslashuvchan:
 *  - lg va undan keng: yopishqoq Sider (yig'ish tugmasi Headerda)
 *  - lg dan tor (mobil): Sider yashirin, menyu chapdan Drawer bo'lib ochiladi
 */
const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = Grid.useBreakpoint();

  // Birinchi renderda screens bo'sh — desktop deb qaraladi (sakrashning oldini oladi)
  const isMobile = screens.lg === false;

  return (
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

      <Layout>
        <Header
          collapsed={isMobile ? !drawerOpen : collapsed}
          onToggle={() =>
            isMobile ? setDrawerOpen((open) => !open) : setCollapsed((c) => !c)
          }
        />
        <Content className="page-container">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
