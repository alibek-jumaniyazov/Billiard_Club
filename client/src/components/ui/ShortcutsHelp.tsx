import { Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { TOKENS } from '../../theme/tokens';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Klaviatura yorliqlari cheat-sheet — `?` bilan yoki foydalanuvchi menyusidan
 * ochiladi. Yorliqlar shu yerda hujjatlanadi (yangi yorliq qo'shsangiz — bitta
 * qator qo'shing). Faqat o'qish uchun, bog'liqliksiz.
 */
const ShortcutsHelp = ({ open, onClose }: Props) => {
  const { t } = useTranslation();

  const rows: Array<{ keys: string[]; desc: string }> = [
    { keys: ['Ctrl', 'K'], desc: t('help.search') },
    { keys: ['Enter'], desc: t('help.checkout') },
    { keys: ['1', '2', '3'], desc: t('help.payment') },
    { keys: ['Esc'], desc: t('help.close') },
  ];

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('help.title')} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {r.keys.map((k, j) => (
                <Text keyboard key={j} style={{ fontSize: 13 }}>
                  {k}
                </Text>
              ))}
            </span>
            <Text type="secondary" style={{ textAlign: 'right' }}>
              {r.desc}
            </Text>
          </div>
        ))}
      </div>
      <Text
        type="secondary"
        style={{
          display: 'block',
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${TOKENS.color.border.subtle}`,
          fontSize: 12,
        }}
      >
        {t('help.hint')}
      </Text>
    </Modal>
  );
};

export default ShortcutsHelp;
