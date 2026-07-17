import { memo } from 'react';
import { Typography } from 'antd';
import { CreditCardOutlined, SwapOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import MoneyText from '../../components/ui/MoneyText';
import { TOKENS } from '../../theme/tokens';
import type { PaymentMethod, RecentPayment } from '../../types';
import ChartCard from './ChartCard';

const { Text } = Typography;

interface RecentPaymentsListProps {
  payments: RecentPayment[];
  currency: string;
  loading: boolean;
}

const METHOD_ICONS: Record<PaymentMethod, JSX.Element> = {
  cash: <WalletOutlined />,
  card: <CreditCardOutlined />,
  transfer: <SwapOutlined />,
};

/**
 * So'nggi to'lovlar lentasi (sales + split to'lovlar, 30 kun ichida).
 * memo: pollda yangi massiv kelgandagina qayta chiziladi.
 */
const RecentPaymentsList = memo(({ payments, currency, loading }: RecentPaymentsListProps) => {
  const { t } = useTranslation();

  return (
    <ChartCard
      title={t('dashboard.recentPaymentsTitle')}
      height={332}
      loading={loading}
      empty={payments.length === 0}
      emptyIcon={<WalletOutlined />}
      emptyTitle={t('dashboard.paymentsEmpty')}
      emptyHint={t('dashboard.paymentsEmptyHint')}
    >
      <div style={{ overflowY: 'auto', flex: 1, marginTop: -6 }}>
        {payments.map((payment, index) => {
          const method = payment.method as PaymentMethod;
          const title =
            payment.customerName ||
            payment.tableName ||
            (payment.tableNumber !== null ? `№${payment.tableNumber}` : t('dashboard.payment'));

          return (
            <div
              key={`${payment.sessionId ?? 'p'}-${payment.createdAt}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: TOKENS.spacing.sm,
                padding: '10px 4px',
                borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: TOKENS.radius.sm,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  color: TOKENS.color.emerald.glow,
                  background: TOKENS.color.emerald.deep,
                  border: `1px solid ${TOKENS.color.emerald.felt}`,
                }}
              >
                {METHOD_ICONS[method] ?? <WalletOutlined />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13.5, display: 'block' }} ellipsis>
                  {title}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t(`payment.${method}`)} · {dayjs(payment.createdAt).format('DD.MM HH:mm')}
                </Text>
              </div>
              <MoneyText
                amount={payment.amount}
                currency={currency}
                size="sm"
                color={TOKENS.color.semantic.success}
              />
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
});

RecentPaymentsList.displayName = 'RecentPaymentsList';

export default RecentPaymentsList;
