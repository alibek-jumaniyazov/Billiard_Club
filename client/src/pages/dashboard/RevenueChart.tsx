import { memo, useMemo, useState } from 'react';
import { Segmented } from 'antd';
import { AreaChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TOKENS } from '../../theme/tokens';
import { formatMoney } from '../../utils/format';
import ChartCard from './ChartCard';
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  compactMoney,
} from './chartTheme';
import type { RevenuePoint } from './types';

type RangeKey = '7' | '30';

interface RevenueChartProps {
  days7: RevenuePoint[];
  /** Server bermasa 30 kunlik rejim ko'rsatilmaydi */
  days30?: RevenuePoint[];
  currency: string;
  loading: boolean;
}

const INCOME_COLOR = TOKENS.color.chart[0]; // oltin
const EXPENSE_COLOR = TOKENS.color.semantic.error;

/**
 * Tushum-xarajat maydon grafigi, 7/30 kunlik almashtirgich bilan.
 * memo — sahifadagi tikerlar/holat o'zgarishlari grafikni qayta chizmaydi;
 * faqat yangi ma'lumot (yangi massiv havolasi) kelganda render bo'ladi.
 */
const RevenueChart = memo(({ days7, days30, currency, loading }: RevenueChartProps) => {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeKey>('7');

  const has30 = Boolean(days30 && days30.length > 0);
  const source = range === '30' && has30 ? days30! : days7;

  const data = useMemo(
    () =>
      source.map((point) => ({
        label: dayjs(point.date).format('DD.MM'),
        income: point.revenue,
        expense: point.expense,
      })),
    [source],
  );

  // Eski server javobida expense bo'lmaydi — seriya butunlay yashiriladi
  const hasExpense = useMemo(() => source.some((p) => p.expense !== undefined), [source]);

  const mln = t('dashboard.mln');
  const thousand = t('dashboard.thousandShort');
  const incomeLabel = t('dashboard.income');
  const expenseLabel = t('dashboard.expense');

  return (
    <ChartCard
      title={t('dashboard.revenueTitle')}
      height={300}
      loading={loading}
      empty={data.length === 0}
      emptyIcon={<AreaChartOutlined />}
      emptyTitle={t('dashboard.chartEmpty')}
      emptyHint={t('dashboard.chartEmptyHint')}
      extra={
        has30 ? (
          <Segmented<RangeKey>
            size="small"
            value={range}
            onChange={setRange}
            options={[
              { label: t('dashboard.range7'), value: '7' },
              { label: t('dashboard.range30'), value: '30' },
            ]}
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dashIncomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={8}
            interval={range === '30' ? 4 : 0}
          />
          <YAxis
            tick={AXIS_TICK}
            tickFormatter={(v: number) => compactMoney(v, mln, thousand)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value: number | string) => formatMoney(Number(value), currency)}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: TOKENS.color.text.secondary, fontSize: 12.5 }}>{value}</span>
            )}
          />
          <Area
            type="monotone"
            dataKey="income"
            name={incomeLabel}
            stroke={INCOME_COLOR}
            strokeWidth={2}
            fill="url(#dashIncomeGradient)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          {hasExpense && (
            <Line
              type="monotone"
              dataKey="expense"
              name={expenseLabel}
              stroke={EXPENSE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});

RevenueChart.displayName = 'RevenueChart';

export default RevenueChart;
