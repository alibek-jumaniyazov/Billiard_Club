import type { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';
import { TOKENS } from '../../theme/tokens';

const { Title, Text } = Typography;

interface PageHeaderProps {
  /** Sahifa sarlavhasi */
  title: ReactNode;
  /** Sarlavha ostidagi ikkilamchi matn */
  subtitle?: ReactNode;
  /** Sarlavha oldidagi ikonka */
  icon?: ReactNode;
  /** O'ng tomondagi amallar (tugmalar va h.k.) */
  extra?: ReactNode;
  /** Sarlavha ostidagi statistika qatori (odatda <Row> ichida StatCard lar) */
  stats?: ReactNode;
  style?: CSSProperties;
}

/**
 * Yagona sahifa sarlavhasi bloki — har sahifada takrorlanadigan
 * "Title + subtitle + amallar" flex shablonining o'rnini bosadi.
 */
const PageHeader = ({ title, subtitle, icon, extra, stats, style }: PageHeaderProps) => (
  <div style={{ marginBottom: TOKENS.spacing.lg, ...style }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: TOKENS.spacing.md,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && (
            <span style={{ color: TOKENS.color.gold.base, fontSize: 22, display: 'inline-flex' }}>
              {icon}
            </span>
          )}
          {title}
        </Title>
        {subtitle && (
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Text>
        )}
      </div>
      {extra && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {extra}
        </div>
      )}
    </div>
    {stats && <div style={{ marginTop: TOKENS.spacing.md }}>{stats}</div>}
  </div>
);

export default PageHeader;
