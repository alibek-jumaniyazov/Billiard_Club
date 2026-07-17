import { useCallback, useEffect, useState } from 'react';
import { App, Button, Space, Spin, Typography } from 'antd';
import {
  LockOutlined,
  PhoneOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi, subscriptionApi } from '../api';
import SubscriptionPlans from '../components/subscription/SubscriptionPlans';
import { BrandLogo, GlassCard, PageTransition } from '../components/ui';
import { SUPPORT_PHONE, SUPPORT_TELEGRAM } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TOKENS } from '../theme/tokens';
import type { Plan, SubscriptionStatus } from '../types';

const { Text, Title } = Typography;
const { gold, emerald, semantic, bg, text } = TOKENS.color;

/** Blok ekrani foni — auth-page gradienti bilan bir xil, lekin tepadan oqadi
 * (uzun kontent flex-markazlashda kesilib qolmasligi uchun) */
const PAGE_BG = [
  `radial-gradient(ellipse at 20% 15%, color-mix(in srgb, ${emerald.felt} 45%, transparent), transparent 55%)`,
  `radial-gradient(ellipse at 80% 85%, ${gold.subtle}, transparent 50%)`,
].join(', ');

/**
 * Obuna blok ekrani — muddati tugagan yoki bloklangan klub foydalanuvchisi
 * shu yerga tushadi. Ma'lumotlar o'chmagani tushuntiriladi va klub egasi
 * (admin) uchun tariflar + xarid oqimi TO'G'RIDAN-TO'G'RI shu yerda ochiladi
 * (server: /subscription* endpointlari @SkipSubscription). To'lov superadmin
 * tomonidan tasdiqlangach "Tekshirish" tugmasi darhol ochib yuboradi.
 */
const Locked = () => {
  const { t } = useTranslation();
  const { user, club, loading, refreshMe, logout } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isBlocked = club?.status === 'blocked';
  const isLocked =
    !!club && (club.status === 'blocked' || club.status === 'expired' || club.isExpired);
  // Faqat admin va bloklanmagan klub uchun xarid oqimi ko'rsatiladi
  const canPurchase = isAdmin && !isBlocked;

  useDocumentHead('locked.docTitle');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await subscriptionApi.status();
      setSubStatus(res.data);
    } catch {
      // Holat yuklanmasa ham ekran ishlayveradi (banner shunchaki chiqmaydi)
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    setPlansError(false);
    setPlans(null);
    try {
      const res = await subscriptionApi.plans();
      setPlans(res.data);
    } catch {
      setPlansError(true);
    }
  }, []);

  useEffect(() => {
    if (!canPurchase || loading) return;
    void fetchStatus();
    void fetchPlans();
  }, [canPurchase, loading, fetchStatus, fetchPlans]);

  if (loading) {
    return (
      <div className="auth-page">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isLocked) {
    return <Navigate to={user.role === 'superadmin' ? '/admin' : '/'} replace />;
  }

  const wasTrial = !club?.subscriptionEndsAt;
  const title = isBlocked
    ? t('locked.blockedTitle')
    : wasTrial
      ? t('locked.trialEnded')
      : t('locked.expiredTitle');
  const desc = isBlocked
    ? t('locked.blockedDesc')
    : wasTrial
      ? t('locked.trialEndedDesc')
      : t('locked.expiredDesc');

  /** Holatni qayta tekshirish — ochilgan bo'lsa darhol yo'naltiradi */
  const handleRecheck = async () => {
    setChecking(true);
    try {
      const res = await authApi.me();
      const fresh = res.data.club;
      const stillLocked =
        !!fresh && (fresh.status === 'blocked' || fresh.status === 'expired' || fresh.isExpired);
      if (stillLocked) {
        message.info(t('locked.stillLocked'));
      } else {
        message.success(t('locked.nowActive'));
        // Kontekst yangilanadi -> yuqoridagi <Navigate/> ishga tushadi
        await refreshMe();
      }
    } catch {
      message.error(t('common.error'));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleChanged = async () => {
    await fetchStatus();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAGE_BG,
        backgroundColor: bg.bg0,
        padding: '40px 16px 56px',
      }}
    >
      <PageTransition>
        <div
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: TOKENS.spacing.lg,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <BrandLogo size={48} withWordmark />
          </div>

          {/* Holat gerosi: nima bo'ldi + ma'lumotlar xavfsizligi kafolati */}
          <GlassCard>
            <div
              style={{
                display: 'flex',
                gap: TOKENS.spacing.lg,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  color: isBlocked ? semantic.error : gold.base,
                  background: isBlocked
                    ? `color-mix(in srgb, ${semantic.error} 12%, transparent)`
                    : gold.subtle,
                  border: `1px solid ${
                    isBlocked
                      ? `color-mix(in srgb, ${semantic.error} 30%, transparent)`
                      : gold.line
                  }`,
                }}
              >
                {isBlocked ? <StopOutlined /> : <LockOutlined />}
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Title level={3} style={{ margin: 0 }}>
                  {title}
                </Title>
                {club?.name && (
                  <Text type="secondary" style={{ display: 'block', marginTop: 2, fontSize: 14 }}>
                    {club.name}
                  </Text>
                )}
                <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
                  {desc}
                </Text>
                {club?.effectiveEndsAt && !isBlocked && (
                  <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                    {t('locked.endedAt')}:{' '}
                    <span className="tabular-nums" style={{ color: text.primary }}>
                      {dayjs(club.effectiveEndsAt).format('DD.MM.YYYY')}
                    </span>
                  </Text>
                )}

                {/* Ma'lumotlar xavfsiz — ishonch bloki */}
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 16px',
                    borderRadius: TOKENS.radius.md,
                    background: emerald.deep,
                    border: `1px solid ${emerald.felt}`,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <SafetyCertificateOutlined
                    style={{ color: emerald.glow, fontSize: 18, marginTop: 2 }}
                  />
                  <div>
                    <Text strong style={{ display: 'block', color: emerald.glow, fontSize: 13.5 }}>
                      {t('locked.dataSafeTitle')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {t('locked.dataSafeDesc')}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Klub egasi: tariflar + xarid oqimi (kutilayotgan faktura banneri bilan) */}
          {canPurchase && (
            <SubscriptionPlans
              plans={plans}
              plansError={plansError}
              onRetry={() => void fetchPlans()}
              pendingInvoice={subStatus?.currentInvoice ?? null}
              activePlanCode={subStatus?.activePlan?.code ?? null}
              onChanged={handleChanged}
            />
          )}

          {/* Kassir/operator: obunani faqat admin uzaytiradi */}
          {!isAdmin && !isBlocked && (
            <GlassCard padding={TOKENS.spacing.md}>
              <Text type="secondary">{t('locked.staffContactAdmin')}</Text>
            </GlassCard>
          )}

          {/* Ikkilamchi amallar: aloqa, tekshirish, chiqish */}
          <GlassCard padding={TOKENS.spacing.md}>
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
              }}
            >
              <Space size={12} wrap>
                <Button
                  icon={<SendOutlined />}
                  href={SUPPORT_TELEGRAM}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t('locked.telegram')}
                </Button>
                {SUPPORT_PHONE && (
                  <Text type="secondary">
                    <PhoneOutlined style={{ marginRight: 6 }} />
                    {t('locked.contact')}:{' '}
                    <span className="tabular-nums" style={{ color: text.primary }}>
                      {SUPPORT_PHONE}
                    </span>
                  </Text>
                )}
              </Space>
              <Space size={12} wrap>
                <Button
                  type={canPurchase ? 'default' : 'primary'}
                  icon={<ReloadOutlined />}
                  loading={checking}
                  onClick={handleRecheck}
                >
                  {t('locked.recheck')}
                </Button>
                <Button onClick={handleLogout}>{t('btn.logout')}</Button>
              </Space>
            </div>
          </GlassCard>
        </div>
      </PageTransition>
    </div>
  );
};

export default Locked;
