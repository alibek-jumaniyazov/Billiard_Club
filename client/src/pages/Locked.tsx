import { useState } from 'react';
import { Button, Card, Result, Space, Typography, App } from 'antd';
import { LockOutlined, PhoneOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { SUPPORT_PHONE, SUPPORT_TELEGRAM } from '../constants';

const { Text } = Typography;

/**
 * Obuna blok ekrani — muddati tugagan yoki bloklangan klub foydalanuvchisi
 * shu yerga tushadi. Ma'lumotlar o'chmagani va admin bilan bog'lanish
 * kerakligi tushuntiriladi. "Tekshirish" tugmasi obuna uzaytirilganini
 * darhol aniqlaydi.
 */
const Locked = () => {
  const { t } = useTranslation();
  const { user, club, loading, refreshMe, logout } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  if (!loading && !user) return <Navigate to="/login" replace />;

  const isLocked =
    !!club && (club.status === 'blocked' || club.status === 'expired' || club.isExpired);
  if (!loading && user && !isLocked) {
    return <Navigate to={user.role === 'superadmin' ? '/admin' : '/'} replace />;
  }

  const isBlocked = club?.status === 'blocked';
  const wasTrial = !club?.subscriptionEndsAt;

  const handleRecheck = async () => {
    setChecking(true);
    try {
      await refreshMe();
      message.info(t('locked.stillLocked'));
    } catch {
      // refreshMe xatosi — holat o'zgarmagan
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="auth-page">
      <Card style={{ width: 480, maxWidth: '100%' }}>
        <Result
          status="warning"
          icon={<LockOutlined style={{ color: '#faad14' }} />}
          title={isBlocked ? t('locked.blockedTitle') : wasTrial ? t('locked.trialEnded') : t('locked.expiredTitle')}
          subTitle={
            <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
              <Text type="secondary">
                {isBlocked ? t('locked.blockedDesc') : t('locked.expiredDesc')}
              </Text>
              {club?.effectiveEndsAt && !isBlocked && (
                <Text type="secondary">
                  {t('locked.endedAt')}: {dayjs(club.effectiveEndsAt).format('DD.MM.YYYY')}
                </Text>
              )}
              {SUPPORT_PHONE && (
                <Text strong>
                  <PhoneOutlined /> {t('locked.contact')}: {SUPPORT_PHONE}
                </Text>
              )}
            </Space>
          }
          extra={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {/* Obuna sotib olish — Telegram orqali adminlar bilan bog'lanish */}
              <Button
                type="primary"
                size="large"
                block
                icon={<SendOutlined />}
                href={SUPPORT_TELEGRAM}
                target="_blank"
              >
                {t('locked.buySubscription')}
              </Button>
              <Space>
                <Button icon={<ReloadOutlined />} loading={checking} onClick={handleRecheck}>
                  {t('locked.recheck')}
                </Button>
                <Button onClick={handleLogout}>{t('btn.logout')}</Button>
              </Space>
            </Space>
          }
        />
      </Card>
    </div>
  );
};

export default Locked;
