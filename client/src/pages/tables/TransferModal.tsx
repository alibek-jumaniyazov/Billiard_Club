import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Descriptions, Modal, Select, Typography } from 'antd';
import { CloudSyncOutlined, SwapOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, isNetworkError, sessionsApi } from '../../api';
import { MoneyText } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { useConnection } from '../../context/ConnectionContext';
import { hasPendingOps } from '../../offline/overlay';
import { newActionKey, queueTransferSession } from '../../offline/pos';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';

const { Text } = Typography;

interface TransferModalProps {
  /** Manba stol (band) — null bo'lsa modal yopiq */
  table: BilliardTable | null;
  /** Ko'chirish mumkin bo'lgan bo'sh stollar (oflayn navbat qoplamasi bilan) */
  freeTables: BilliardTable[];
  onClose: () => void;
  /** Muvaffaqiyatli ko'chirilgan sessiya (segments bilan) */
  onTransferred: (session: Session) => void;
  /**
   * Ko'chirish NAVBATGA yozildi (internet yo'q yoki shu stollarda yuborilmagan
   * amal bor). Ekrandagi holatni navbat qoplamasi chizadi (offline/overlay.ts).
   */
  onQueuedOffline: () => void;
  /**
   * Server soati bilan farq (ms) — oflayn ko'chirish payti AYNAN shu soatdan
   * olinadi: ekrandagi jonli summa bilan server bo'linishi bir xil bo'lsin.
   */
  offsetMs: number;
}

/** Sessiyani boshqa stolga ko'chirish — yangi stol narxi ko'rsatiladi */
const TransferModal = ({ table, freeTables, onClose, onTransferred, onQueuedOffline, offsetMs }: TransferModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { online, entries } = useConnection();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = table?.sessions?.[0] ?? null;
  const currency = useCurrency();

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
  /**
   * NAVBAT ORQALI: internet yo'q, sessiya hali serverda yo'q (oflayn
   * boshlangan) yoki manba/maqsad stolda yuborilmagan amal bor — ko'chirish
   * ulardan keyin, tartib bilan yuborilishi shart.
   */
  const viaQueue = !online || Boolean(session?.offlineLocalId)
    || hasPendingOps(entries, session, table ? [table.id, ...(targetId ? [targetId] : [])] : []);

  const handleOk = async () => {
    if (!session || !table || !target) return;
    setSubmitting(true);
    // Bir martalik kalit — onlayn urinish va navbatdagi takror uchun BIR XIL
    const key = newActionKey();
    const queue = async (afterPending: boolean) => {
      await queueTransferSession(table, session, target, key, offsetMs);
      message.success(t(afterPending ? 'offline.savedQueued' : 'offline.savedOffline'));
      onQueuedOffline();
      onClose();
    };
    try {
      if (viaQueue) {
        await queue(online);
        return;
      }
      const res = await sessionsApi.transfer(session.id, target.id, key);
      message.success(res.message);
      onTransferred(res.data);
      onClose();
    } catch (err) {
      // Aloqa aynan shu so'rovda uzildi — ko'chirish yo'qolmasin, bosilgan
      // payt bilan navbatga tushsin (server bajargan bo'lsa kalit takrorni qaytaradi)
      if (!viaQueue && isNetworkError(err)) {
        try {
          await queue(false);
          return;
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
          return;
        }
      }
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`${t('tables.transferTitle')} — ${t('common.table')} ${table?.number ?? ''}`}
      className="table-session-modal"
      width="min(520px, calc(100vw - 24px))"
      centered
      open={!!table}
      onCancel={() => { if (!submitting) onClose(); }}
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      onOk={() => void handleOk()}
      confirmLoading={submitting}
      okText={t('tables.transferOk')}
      okButtonProps={{ icon: <SwapOutlined />, disabled: !targetId }}
      cancelText={t('btn.cancel')}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Internetsiz ko'chirish — kassir summa qachon bo'linishini bilsin */}
        {!online && (
          <Alert type="info" showIcon icon={<CloudSyncOutlined />} message={t('offline.transferOfflineDesc')} />
        )}
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
