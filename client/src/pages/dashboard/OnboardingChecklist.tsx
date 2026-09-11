import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Progress, Typography } from 'antd';
import { CheckCircleFilled, CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { productsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { TOKENS } from '../../theme/tokens';
import type { LiveDashboardStats } from './types';

const { Text, Title } = Typography;

interface Props {
  stats: LiveDashboardStats | null;
}

/**
 * "Ishni boshlash" checklist — YANGI klub uchun 3 qadamli yo'nalish
 * (stol -> mahsulot -> birinchi o'yin). Faqat ADMIN ko'radi va faqat birinchi
 * o'yin boshlanmaguncha: o'yin boshlangani zahoti klub ishga tushgani aniq
 * bo'ladi va karta o'zi yo'qoladi. Yopib qo'yish (X) klub bo'yicha localStorage
 * da eslanadi — qayta bezovta qilmaydi. Barcha o'qishlar mavjud dashboard
 * ma'lumotidan (qo'shimcha mahsulot so'rovi faqat karta ko'rinishi kerak bo'lsa).
 */
const dismissKey = (clubId: number | null | undefined) => `bc:onboardingDismissed:${clubId ?? 0}`;

const OnboardingChecklist = ({ stats }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  const [dismissed, setDismissed] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);

  // Yopilgan holatni klub bo'yicha localStorage dan o'qiymiz (xavfsiz)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey(user?.clubId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [user?.clubId]);

  const tablesDone = (stats?.totalTables ?? 0) > 0;
  const gamesDone =
    (stats?.recentSessions?.length ?? 0) > 0 ||
    (stats?.activeSessions ?? 0) > 0 ||
    (stats?.mostUsedTables?.length ?? 0) > 0;

  // Karta umuman ko'rinishi mumkinmi (mahsulotni shundagina so'raymiz)
  const relevant = !!stats && hasRole('admin') && !dismissed && !gamesDone;

  useEffect(() => {
    if (!relevant || productCount !== null) return;
    let alive = true;
    productsApi
      .list()
      .then((rows) => alive && setProductCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => alive && setProductCount(0));
    return () => {
      alive = false;
    };
  }, [relevant, productCount]);

  const productsDone = (productCount ?? 0) > 0;

  const steps = useMemo(
    () => [
      { done: tablesDone, label: t('dashboard.onbTables'), hint: t('dashboard.onbTablesHint'), action: t('dashboard.onbGoTables'), to: '/tables' },
      { done: productsDone, label: t('dashboard.onbProducts'), hint: t('dashboard.onbProductsHint'), action: t('dashboard.onbGoProducts'), to: '/products' },
      { done: gamesDone, label: t('dashboard.onbGame'), hint: t('dashboard.onbGameHint'), action: t('dashboard.onbGoGame'), to: '/tables' },
    ],
    [tablesDone, productsDone, gamesDone, t],
  );

  if (!relevant) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // hammasi bajarildi — karta kerak emas

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(user?.clubId), '1');
    } catch {
      /* private rejim — jimgina o'tkazamiz */
    }
    setDismissed(true);
  };

  return (
    <Card
      style={{
        marginBottom: 16,
        background: `linear-gradient(150deg, ${TOKENS.color.bg.bg2} 0%, ${TOKENS.color.bg.bg1} 60%)`,
        borderColor: `color-mix(in srgb, ${TOKENS.color.gold.base} 30%, ${TOKENS.color.border.subtle})`,
      }}
      styles={{ body: { padding: '18px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }}>
            {t('dashboard.onbTitle')}
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('dashboard.onbSubtitle')}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Text type="secondary" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
            {t('dashboard.onbProgress', { done: doneCount, total: steps.length })}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={dismiss}
            aria-label={t('dashboard.onbDismiss')}
          />
        </div>
      </div>

      <Progress
        percent={Math.round((doneCount / steps.length) * 100)}
        showInfo={false}
        strokeColor={TOKENS.color.gold.base}
        style={{ margin: '10px 0 6px' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 10px',
              borderRadius: TOKENS.radius.md,
              background: step.done ? 'transparent' : 'color-mix(in srgb, #fff 3%, transparent)',
            }}
          >
            {step.done ? (
              <CheckCircleFilled style={{ fontSize: 20, color: TOKENS.color.semantic.success }} />
            ) : (
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${TOKENS.color.text.tertiary}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: TOKENS.color.text.tertiary,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text
                style={{
                  display: 'block',
                  fontSize: 14,
                  textDecoration: step.done ? 'line-through' : 'none',
                  color: step.done ? TOKENS.color.text.tertiary : TOKENS.color.text.primary,
                }}
              >
                {step.label}
              </Text>
              {!step.done && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {step.hint}
                </Text>
              )}
            </div>
            {!step.done && (
              <Button size="small" type="primary" onClick={() => navigate(step.to)}>
                {step.action}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default OnboardingChecklist;
