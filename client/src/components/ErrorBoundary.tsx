import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Result, Space, Typography } from 'antd';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  /**
   * Qiymati o'zgarganda xato holati AVTOMATIK tozalanadi.
   * Marshrut ichidagi chegara uchun bu `location.key` bo'ladi — foydalanuvchi
   * boshqa sahifaga o'tishi bilan ilova o'ziga keladi, sahifani qayta
   * yuklashning hojati qolmaydi.
   */
  resetKey?: string;
  /** true — bu chegara marshrut ICHIDA (navigatsiya tirik, "bosh sahifaga" mantiqli) */
  inRoute?: boolean;
}

interface State {
  hasError: boolean;
  message: string;
}

/** Chunk yuklash xatosi bir marta qayta yuklab ko'rilgani — cheksiz siklga tushmaslik uchun */
const CHUNK_RELOAD_FLAG = 'chunkReloadAttempt';

/**
 * Dinamik import (lazy route) yuklana olmadimi.
 *
 * Bu deploy dan keyingi eng ko'p uchraydigan holat: yangi build hashli chunk
 * nomlarini o'zgartiradi, ochiq turgan eski sahifa esa endi mavjud bo'lmagan
 * faylni so'raydi. Buni oddiy "kutilmagan xatolik" deb ko'rsatish noto'g'ri —
 * to'g'ri chorasi bir marta qayta yuklash.
 */
const isChunkLoadError = (error: unknown): boolean => {
  const err = error as { name?: string; message?: string } | null;
  const text = `${err?.name ?? ''} ${err?.message ?? ''}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk .* failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
};

/**
 * XATO CHEGARASI — bitta sahifadagi render xatosi butun POS ni oq ekran
 * qilib qo'ymaydi (kassada ishlayotgan tizim uchun kritik).
 *
 * Ikki joyda ishlatiladi:
 *  1. main.tsx da — ildizda, oxirgi himoya chizig'i;
 *  2. AppLayout da Outlet atrofida — sahifa xatosi navigatsiyani O'LDIRMAYDI,
 *     foydalanuvchi yon menyudan boshqa sahifaga o'tib ishini davom ettiradi.
 *
 * Avval yagona chora `reload()` edi. Determinatsiyalangan xatoda (masalan
 * hisobot ma'lumotining kutilmagan shakli) bu cheksiz siklga aylanardi:
 * qayta yuklash → o'sha crash → qayta yuklash. Endi "bosh sahifaga" chiqish
 * yo'li bor va marshrut almashganda holat o'zi tiklanadi.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: (error as Error)?.message ?? '' };
  }

  componentDidUpdate(prevProps: Props) {
    // Marshrut o'zgardi — yangi sahifaga toza kirish imkonini beramiz
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary:', error, errorInfo);

    // Yangi versiya chiqqan — chunk topilmadi. BIR MARTA qayta yuklaymiz;
    // bayroq sessionStorage da, shuning uchun ikkinchi marta yuklanmaydi
    // (aks holda tarmoq muammosida cheksiz sikl bo'lardi).
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
          sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
          window.location.reload();
        }
      } catch {
        // sessionStorage yopiq — qayta yuklamaymiz, oddiy xato ekrani chiqadi
      }
    }
  }

  private goHome = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    } catch {
      /* e'tiborsiz */
    }
    window.location.assign('/');
  };

  private reload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    } catch {
      /* e'tiborsiz */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunk = isChunkLoadError({ message: this.state.message });

    return (
      <div
        style={{
          minHeight: this.props.inRoute ? '50vh' : '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Result
          status={chunk ? 'info' : 'error'}
          title={chunk ? i18n.t('offline.chunkTitle') : i18n.t('error.boundaryTitle')}
          subTitle={chunk ? i18n.t('offline.chunkDesc') : i18n.t('error.boundaryDesc')}
          extra={
            <Space wrap>
              <Button type="primary" onClick={this.reload}>
                {i18n.t('error.reload')}
              </Button>
              <Button onClick={this.goHome}>{i18n.t('offline.errorGoHome')}</Button>
            </Space>
          }
        >
          {/* Texnik tafsilot — qo'llab-quvvatlashga aytish uchun, lekin
              ekranni bosib ketmaydigan ko'rinishda */}
          {this.state.message && !chunk && (
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 12, textAlign: 'center', marginBottom: 0, wordBreak: 'break-word' }}
            >
              {i18n.t('offline.errorDetails')}: {this.state.message}
            </Typography.Paragraph>
          )}
        </Result>
      </div>
    );
  }
}

export default ErrorBoundary;
