import { useEffect, useMemo, useState } from 'react';
import { App, Descriptions, Modal, Select, Typography } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, sessionsApi } from '../../api';
import { MoneyText } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';

const { Text } = Typography;

interface TransferModalProps {
  /** Manba stol (band) — null bo'lsa modal yopiq */
  table: BilliardTable | null;
  /** Ko'chirish mumkin bo'lgan bo'sh stollar */
  freeTables: BilliardTable[];
  onClose: () => void;
  /** Muvaffaqiyatli ko'chirilgan sessiya (segments bilan) */
  onTransferred: (session: Session) => void;
}

/** Sessiyani boshqa stolga ko'chirish — yangi stol narxi ko'rsatiladi */
const TransferModal = ({ table, freeTables, onClose, onTransferred }: TransferModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = table?.sessions?.[0] ?? null;
  const currency = t('common.sum');

  useEffect(() => {
    if (table) setTargetId(null);
  }, [table]);

  const options = useMemo(
    () =>
      freeTables
        .filter((tbl) => tbl.id !== table?.id)
        .map((tbl) => ({
          value: tbl.id,
          label: `${t('common.table')} ${tbl.number} — ${tbl.name}`,
        })),
    [freeTables, table, t],
  );

  const target = freeTables.find((tbl) => tbl.id === targetId) ?? null;
  const currentPrice = session?.pricePerHour ?? table?.pricePerHour ?? 0;

  const handleOk = async () => {
    if (!session || !targetId) return;
    setSubmitting(true);
    try {
      const res = await sessionsApi.transfer(session.id, targetId);
      message.success(res.message);
      onTransferred(res.data);
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`${t('tables.transferTitle')} — ${t('common.table')} ${table?.number ?? ''}`}
      open={!!table}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={submitting}
      okText={t('tables.transferOk')}
      okButtonProps={{ icon: <SwapOutlined />, disabled: !targetId }}
      cancelText={t('btn.cancel')}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            {t('tables.transferTarget')}
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder={options.length ? t('tables.transferTarget') : t('tables.noFreeTables')}
            options={options}
            value={targetId}
            onChange={setTargetId}
            disabled={options.length === 0}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent={<Text type="secondary">{t('tables.noFreeTables')}</Text>}
          />
        </div>

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('tables.currentPrice')}>
            <MoneyText amount={currentPrice} currency={currency} size="sm" />
            <Text type="secondary"> / {t('tables.perHour')}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('tables.newPrice')}>
            {target ? (
              <>
                <MoneyText
                  amount={target.pricePerHour}
                  currency={currency}
                  size="sm"
                  color={TOKENS.color.gold.base}
                />
                <Text type="secondary"> / {t('tables.perHour')}</Text>
              </>
            ) : (
              <Text type="secondary">—</Text>
            )}
          </Descriptions.Item>
        </Descriptions>

        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('tables.transferHint')}
        </Text>
      </div>
    </Modal>
  );
};

export default TransferModal;
