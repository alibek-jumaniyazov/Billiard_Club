import type { ReactNode } from 'react';
import { Card, Skeleton } from 'antd';
import EmptyState from '../../components/ui/EmptyState';

interface ChartCardProps {
  title: ReactNode;
  /** Sarlavha o'ng tomonidagi boshqaruv (masalan davr tanlagichi) */
  extra?: ReactNode;
  /** Tana balandligi (px) — skelet/bo'sh holat ham shu balandlikda */
  height: number;
  loading?: boolean;
  /** true bo'lsa EmptyState ko'rsatiladi */
  empty?: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: ReactNode;
  emptyHint?: ReactNode;
  children: ReactNode;
}

/**
 * Grafik/ro'yxat kartalarining umumiy qobig'i — skelet va bo'sh holat
 * bir xil balandlikda turadi, sahifa "sakramaydi".
 */
const ChartCard = ({
  title,
  extra,
  height,
  loading = false,
  empty = false,
  emptyIcon,
  emptyTitle,
  emptyHint,
  children,
}: ChartCardProps) => (
  <Card
    title={title}
    extra={extra}
    styles={{
      header: { minHeight: 52 },
      body: { padding: 16, height, display: 'flex', flexDirection: 'column' },
    }}
  >
    {loading ? (
      <Skeleton active title={false} paragraph={{ rows: Math.max(3, Math.round(height / 56)) }} />
    ) : empty ? (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        hint={emptyHint}
        style={{ flex: 1, padding: '16px 24px' }}
      />
    ) : (
      children
    )}
  </Card>
);

export default ChartCard;
