import { memo, useMemo } from 'react';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TOKENS } from '../../theme/tokens';
import ChartCard from './ChartCard';
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  HOVER_CURSOR,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme';

interface PeakHoursChartProps {
  peakHours: Array<{ hour: number; sessions: number }>;
  loading: boolean;
}

const BAR_COLOR = TOKENS.color.emerald.bright;

/**
 * Eng gavjum soatlar — 24 soatlik gistogramma (so'nggi 30 kun).
 * memo: faqat yangi peakHours massivi kelganda qayta chiziladi.
 */
const PeakHoursChart = memo(({ peakHours, loading }: PeakHoursChartProps) => {
  const { t } = useTranslation();

  const data = useMemo(
    () =>
      peakHours.map((p) => ({
        label: String(p.hour).padStart(2, '0'),
        sessions: p.sessions,
      })),
    [peakHours],
  );

  const empty = useMemo(() => peakHours.every((p) => p.sessions === 0), [peakHours]);

  return (
    <ChartCard
      title={t('dashboard.peakHoursTitle')}
      height={300}
      loading={loading}
      empty={empty}
      emptyIcon={<ClockCircleOutlined />}
      emptyTitle={t('dashboard.chartEmpty')}
      emptyHint={t('dashboard.peakHoursEmptyHint')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ ...AXIS_TICK, fontSize: 10.5 }}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={6}
            interval={2}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            cursor={HOVER_CURSOR}
            labelFormatter={(label: string) => `${label}:00 – ${label}:59`}
            formatter={(value: number | string) => [Number(value), t('dashboard.sessionsLabel')]}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Bar
            dataKey="sessions"
            name={t('dashboard.sessionsLabel')}
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});

PeakHoursChart.displayName = 'PeakHoursChart';

export default PeakHoursChart;
