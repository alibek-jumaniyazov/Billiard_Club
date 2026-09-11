import { useEffect, useMemo, useState } from 'react';
import { Empty, Input, List, Modal, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV_DESTINATIONS } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { TOKENS } from '../../theme/tokens';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Buyruq paneli (Ctrl/Cmd+K) — foydalanuvchi sahifa nomini yozib, bir
 * bosishda o'sha sahifaga o'tadi. Ro'yxat NAV_DESTINATIONS dan (yagona manba)
 * va foydalanuvchi ROLI bo'yicha filtrlanadi (kassir /staff ni ko'rmaydi).
 * Ok/strelka — tanlash, Enter — ochish, Esc — yopish. Planshet uchun Header'da
 * teginiladigan qidiruv tugmasi ham bor (bir xil panelni ochadi).
 */
const CommandPalette = ({ open, onClose }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const destinations = useMemo(
    () =>
      NAV_DESTINATIONS.filter((d) => hasRole(...d.roles)).map((d) => ({
        path: d.path,
        label: t(d.titleKey),
      })),
    [hasRole, t],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => d.label.toLowerCase().includes(q));
  }, [destinations, query]);

  // Ochilganda tozalash; qidiruv o'zgarganda tanlovni boshiga qaytarish
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnHidden
      width={520}
      style={{ top: 80 }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: 12 }}>
        <Input
          size="large"
          autoFocus
          allowClear
          prefix={<SearchOutlined style={{ color: TOKENS.color.text.tertiary }} />}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const item = filtered[active];
              if (item) go(item.path);
            }
          }}
        />
      </div>
      <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '0 6px 6px' }}>
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('search.noResults')}
            style={{ padding: '20px 0' }}
          />
        ) : (
          <List
            size="small"
            dataSource={filtered}
            renderItem={(item, i) => (
              <List.Item
                onClick={() => go(item.path)}
                onMouseEnter={() => setActive(i)}
                style={{
                  cursor: 'pointer',
                  borderRadius: TOKENS.radius.sm,
                  padding: '10px 12px',
                  border: 'none',
                  background:
                    i === active ? 'color-mix(in srgb, #fff 6%, transparent)' : 'transparent',
                }}
              >
                {item.label}
              </List.Item>
            )}
          />
        )}
      </div>
      <div
        style={{
          padding: '8px 14px',
          borderTop: `1px solid ${TOKENS.color.border.subtle}`,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('search.hint')}
        </Text>
      </div>
    </Modal>
  );
};

export default CommandPalette;
