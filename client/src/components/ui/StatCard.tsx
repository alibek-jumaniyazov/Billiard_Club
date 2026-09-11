import type { CSSProperties, ReactNode } from 'react';
import { Card, Skeleton, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { TOKENS } from '../../theme/tokens';

const { Text } = Typography;

interface StatCardProps {
  /** Ko'rsatkich nomi */
  label: ReactNode;
  /** Qiymat (tayyor formatlangan matn/element) */
  value: ReactNode;
  /** Ikonka — urg'u rangli dumaloq kvadrat ichida ko'rsatiladi */
  icon?: ReactNode;
  /** O'sish/kamayish foizi (masalan 12.5 yoki -3.2) */
  trend?: number;
  /** Trend yonidagi izoh (masalan "o'tgan haftaga nisbatan") */
  trendLabel?: ReactNode;
  /**
   * Ko'rsatkich ma'nosini tushuntiruvchi izoh — nom yonida (i) ikonka ostida
   * tooltip bo'lib chiqadi (masalan "tushum" nima ekanini aniqlashtiradi).
   */
  hint?: ReactNode;
  /** Nom ostidagi mayda izoh (masalan "oxirgi 7 kun") */
  sublabel?: ReactNode;
  /** 0–100 to'ldirish paneli (masalan bandlik foizi) — qiymat ostida chiziq */
  meter?: number;
  /** Qiymat ustidagi to'liq matn (ellipsis bilan kesilsa native tooltip) */
  valueTitle?: string;
  /** Yuklanish holati — skelet ko'rsatiladi */
  loading?: boolean;
  /** Urg'u rangi (standart: oltin) */
  accent?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Premium statistika kartasi — nozik gradientli karbon fon, urg'u rangli
 * ikonka va ixtiyoriy trend ko'rsatkichi. Sahifalardagi 20+ Card+Statistic
 * nusxalarining o'rnini bosadi.
 */
const StatCard = ({
  label,
  value,
  icon,
  trend,
  trendLabel,
  hint,
  sublabel,
  meter,
  valueTitle,
  loading = false,
  accent = TOKENS.color.gold.base,
  style,
  className,
}: StatCardProps) => {
  const trendColor =
    trend === undefined
      ? undefined
      : trend >= 0
        ? TOKENS.color.semantic.success
        : TOKENS.color.semantic.error;

  return (
    <Card
      className={className}
      style={{
        /* Diagonal nozik "sheen" + karbon gradient — chuqurlik hissi */
        background: `linear-gradient(120deg, rgba(255, 255, 255, 0.03) 0%, transparent 42%), linear-gradient(150deg, ${TOKENS.color.bg.bg2} 0%, ${TOKENS.color.bg.bg1} 55%)`,
        borderColor: TOKENS.color.border.subtle,
        boxShadow: `${TOKENS.shadow.level1}, ${TOKENS.shadow.cardHighlight}`,
        height: '100%',
        ...style,
      }}
      styles={{ body: { padding: '18px 20px' } }}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: '55%' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {icon && (
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: TOKENS.radius.md,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 19,
                color: accent,
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text
              type="secondary"
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {label}
              {hint && (
                <Tooltip title={hint}>
                  <InfoCircleOutlined
                    style={{ fontSize: 12, color: TOKENS.color.text.tertiary, cursor: 'help' }}
                  />
                </Tooltip>
              )}
            </Text>
            {sublabel && (
              <Text type="secondary" style={{ fontSize: 11.5, display: 'block', opacity: 0.8 }}>
                {sublabel}
              </Text>
            )}
            <div
              className="tabular-nums"
              title={valueTitle}
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: TOKENS.color.text.primary,
                lineHeight: 1.3,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {value}
            </div>
            {meter !== undefined && (
              <div
                aria-hidden
                style={{
                  marginTop: 8,
                  height: 4,
                  borderRadius: 999,
                  background: TOKENS.color.border.subtle,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, meter))}%`,
                    background: accent,
                    borderRadius: 999,
                  }}
                />
              </div>
            )}
            {trend !== undefined && (
              <div style={{ marginTop: 4, fontSize: 12.5, display: 'flex', gap: 6 }}>
                <span className="tabular-nums" style={{ color: trendColor, fontWeight: 600 }}>
                  {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{' '}
                  {Math.abs(trend).toFixed(1)}%
                </span>
                {trendLabel && <Text type="secondary" style={{ fontSize: 12.5 }}>{trendLabel}</Text>}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default StatCard;
