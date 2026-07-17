import type { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { TOKENS } from '../../theme/tokens';

const { Text } = Typography;

interface EmptyStateProps {
  /** Ikonka (standart: InboxOutlined) */
  icon?: ReactNode;
  /** Sarlavha */
  title: ReactNode;
  /** Izoh/maslahat matni */
  hint?: ReactNode;
  /** Amal tugmasi (masalan "Stol qo'shish") */
  action?: ReactNode;
  style?: CSSProperties;
}

/**
 * Temaga mos bo'sh holat — yalang'och antd <Empty/> o'rniga.
 * Zumrad tusli ikonka doirasi + sarlavha + maslahat + ixtiyoriy amal.
 */
const EmptyState = ({ icon, title, hint, action, style }: EmptyStateProps) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '48px 24px',
      gap: 6,
      ...style,
    }}
  >
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 26,
        color: TOKENS.color.emerald.glow,
        background: TOKENS.color.emerald.deep,
        border: `1px solid ${TOKENS.color.emerald.felt}`,
        marginBottom: 10,
      }}
    >
      {icon ?? <InboxOutlined />}
    </div>
    <Text strong style={{ fontSize: 15 }}>
      {title}
    </Text>
    {hint && (
      <Text type="secondary" style={{ fontSize: 13, maxWidth: 360 }}>
        {hint}
      </Text>
    )}
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </div>
);

export default EmptyState;
