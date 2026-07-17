import { memo, useMemo } from 'react';
import { TableOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TOKENS } from '../../theme/tokens';
import { formatMoney } from '../../utils/format';
import ChartCard from './ChartCard';
import { AXIS_TICK, GRID_STROKE, HOVER_CURSOR, TOOLTIP_CONTENT_STYLE } from './chartTheme';
import type { LiveDashboardStats } from './types';

interface TopTablesChartProps {
  mostUsedTables: LiveDashboardStats['mostUsedTables'];
  currency: string;
  loading: boolean;
}

interface TableRow {
  name: string;
  sessions: number;
  revenue: number;
}

const BAR_COLOR = TOKENS.color.gold.base;

/** Maxsus tooltip — o'yinlar soni + tushum birga ko'rinadi */
const TableTooltip = ({
  active,
  payload,
  currency,
  sessionsLabel,
  revenueLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: TableRow }>;
  currency: string;
  sessionsLabel: string;
  revenueLabel: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div style={TOOLTIP_CONTENT_STYLE}>
      <div style={{ color: TOKENS.color.text.primary, fontWeight: 600, marginBottom: 4 }}>
        {row.name}
      </div>
      <div style={{ color: TOKENS.color.text.secondary }}>
        {sessionsLabel}: <span className="tabular-nums">{row.sessions}</span>
      </div>
      <div style={{ color: TOKENS.color.text.secondary }}>
        {revenueLabel}:{' '}
        <span className="tabular-nums">{formatMoney(row.revenue, currency)}</span>
      </div>
    </div>
  );
};

/**
 * Eng band stollar (30 kun) — gorizontal barlar, o'yinlar soni bo'yicha.
 * memo: tikerlarga bog'lanmagan, faqat yangi ma'lumotda qayta chiziladi.
 */
const TopTablesChart = memo(({ mostUsedTables, currency, loading }: TopTablesChartProps) => {
  const { t } = useTranslation();

  const rows = useMemo<TableRow[]>(
    () =>
      mostUsedTables.map((row) => ({
        name: row.name ?? (row.number !== null ? `№${row.number}` : '—'),
        sessions: row.sessions,
        revenue: row.revenue,
      })),
    [mostUsedTables],
  );

  return (
    <ChartCard
      title={t('dashboard.topTablesTitle')}
      height={300}
      loading={loading}
      empty={rows.length === 0}
      emptyIcon={<TableOutlined />}
      emptyTitle={t('dashboard.chartEmpty')}
      emptyHint={t('dashboard.topTablesEmptyHint')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tick={{ ...AXIS_TICK, fill: TOKENS.color.text.secondary, fontSize: 12.5 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={HOVER_CURSOR}
            content={
              <TableTooltip
                currency={currency}
                sessionsLabel={t('dashboard.sessionsLabel')}
                revenueLabel={t('dashboard.income')}
              />
            }
          />
          <Bar
            dataKey="sessions"
            name={t('dashboard.sessionsLabel')}
            fill={BAR_COLOR}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          >
            <LabelList
              dataKey="sessions"
              position="right"
              style={{
                fill: TOKENS.color.text.secondary,
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});

TopTablesChart.displayName = 'TopTablesChart';

export default TopTablesChart;
