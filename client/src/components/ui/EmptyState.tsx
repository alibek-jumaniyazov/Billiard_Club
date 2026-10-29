import { useId, type CSSProperties, type ReactNode } from 'react';
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

/** Cho'ntaklar (teshiklar) markazlari — stol tasviri uchun */
const POCKETS: Array<[number, number]> = [
  [19, 33],
  [60, 31],
  [101, 33],
  [19, 65],
  [60, 67],
  [101, 65],
];

/**
 * Kichik billiard stoli: lampa nuri, yog'och bort, mato va uchta shar —
 * brendga mos bo'sh holat tasviri. Burchakdagi nishonda sahifaning o'z
 * ikonkasi (buyurtma, qarz va h.k.) turadi.
 */
const TableArt = ({ icon }: { icon: ReactNode }) => {
  const uid = useId().replace(/:/g, '');
  const glow = `es-glow-${uid}`;
  const felt = `es-felt-${uid}`;
  const ball = (cx: number, cy: number, fill: string) => (
    <g>
      <circle cx={cx} cy={cy} r={5.6} fill={fill} />
      <circle cx={cx - 1.7} cy={cy - 1.9} r={1.7} fill="#fff" opacity={0.75} />
    </g>
  );
  return (
    <div aria-hidden style={{ position: 'relative', width: 120, height: 86, marginBottom: 12 }}>
      <svg width="120" height="86" viewBox="0 0 120 86">
        <defs>
          <radialGradient id={glow} cx="50%" cy="18%" r="72%">
            <stop offset="0" stopColor="#fff1c2" stopOpacity="0.2" />
            <stop offset="1" stopColor="#fff1c2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={felt} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={TOKENS.color.emerald.base} />
            <stop offset="1" stopColor={TOKENS.color.emerald.deep} />
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="40" rx="60" ry="42" fill={`url(#${glow})`} />
        <ellipse cx="60" cy="78" rx="46" ry="6" fill="#000" opacity="0.35" />
        <rect x="12" y="26" width="96" height="46" rx="11" fill={TOKENS.color.wood.base} />
        <rect x="18" y="32" width="84" height="34" rx="7" fill={`url(#${felt})`} />
        {POCKETS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.3} fill="#070a08" />
        ))}
        {ball(41, 50, TOKENS.color.ivory)}
        {ball(75, 46, TOKENS.color.gold.base)}
        {ball(84, 56, '#c0392b')}
      </svg>
      <span
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          fontSize: 15,
          color: TOKENS.color.emerald.glow,
          background: TOKENS.color.emerald.deep,
          border: `1px solid ${TOKENS.color.emerald.felt}`,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.45)',
        }}
      >
        {icon}
      </span>
    </div>
  );
};

/**
 * Temaga mos bo'sh holat — yalang'och antd <Empty/> o'rniga.
 * Billiard stoli tasviri + sarlavha + maslahat + ixtiyoriy amal.
 */
const EmptyState = ({ icon, title, hint, action, style }: EmptyStateProps) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '44px 24px',
      gap: 6,
      ...style,
    }}
  >
    <TableArt icon={icon ?? <InboxOutlined />} />
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
