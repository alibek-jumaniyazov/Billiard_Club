import { memo } from 'react';
import { Typography } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MoneyText from '../../components/ui/MoneyText';
import { TOKENS } from '../../theme/tokens';
import ChartCard from './ChartCard';
import type { LiveDashboardStats } from './types';

const { Text } = Typography;

interface TopCustomersListProps {
  topCustomers: LiveDashboardStats['topCustomers'];
  currency: string;
  loading: boolean;
}

/** O'rin raqami rangi: 1 — oltin, 2 — kumush matn, 3 — xira oltin */
const rankColor = (index: number): string => {
  if (index === 0) return TOKENS.color.gold.base;
  if (index === 1) return TOKENS.color.text.secondary;
  if (index === 2) return TOKENS.color.gold.dim;
  return TOKENS.color.text.tertiary;
};

/**
 * Top mijozlar (so'nggi 30 kun) — sarflagan summa bo'yicha reyting.
 * memo: pollda yangi massiv kelgandagina qayta chiziladi.
 */
const TopCustomersList = memo(({ topCustomers, currency, loading }: TopCustomersListProps) => {
  const { t } = useTranslation();

  return (
    <ChartCard
      title={t('dashboard.topCustomersTitle')}
      height={332}
      loading={loading}
      empty={topCustomers.length === 0}
      emptyIcon={<CrownOutlined />}
      emptyTitle={t('dashboard.customersEmpty')}
      emptyHint={t('dashboard.customersEmptyHint')}
    >
      <div style={{ overflowY: 'auto', flex: 1, marginTop: -6 }}>
        {topCustomers.map((customer, index) => (
          <div
            key={customer.customerId ?? `${customer.name}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: TOKENS.spacing.sm,
              padding: '10px 4px',
              borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
            }}
          >
            <span
              className="tabular-nums"
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12.5,
                fontWeight: 700,
                flexShrink: 0,
                color: rankColor(index),
                background: `color-mix(in srgb, ${rankColor(index)} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${rankColor(index)} 30%, transparent)`,
              }}
            >
              {index + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 13.5, display: 'block' }} ellipsis>
                {customer.name ?? t('dashboard.anonymous')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('dashboard.gamesCount', { n: customer.sessions })}
              </Text>
            </div>
            <MoneyText amount={customer.totalSpent} currency={currency} size="sm" />
          </div>
        ))}
      </div>
    </ChartCard>
  );
});

TopCustomersList.displayName = 'TopCustomersList';

export default TopCustomersList;
