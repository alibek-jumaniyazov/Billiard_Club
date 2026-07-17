import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Result } from 'antd';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Global xato chegarasi — bitta sahifadagi render xatosi butun POS ni
 * oq ekran qilib qo'ymaydi (kassada ishlayotgan tizim uchun kritik).
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Result
            status="error"
            title={i18n.t('error.boundaryTitle')}
            subTitle={i18n.t('error.boundaryDesc')}
            extra={
              <Button type="primary" onClick={() => window.location.reload()}>
                {i18n.t('error.reload')}
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
