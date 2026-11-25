import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Input, Modal, Skeleton, Space, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { adminApi, errorMessage } from '../../api';
import type { Club, ClubDeletePreview } from '../../types';
import { formatMoney, formatNumber } from '../../utils/format';
import { clubDeleteKeepsBilling, clubDeleteRows, confirmNameMatches } from './clubDelete';

const { Text } = Typography;

interface ClubDeleteModalProps {
  /** O'chiriladigan klub; null — oyna yopiq */
  club: Club | null;
  onClose: () => void;
  /** Muvaffaqiyatli o'chirilgandan keyin (ro'yxatni yangilash, ochiq panelni yopish) */
  onDeleted: (club: Club) => void;
}

/**
 * Klubni BARCHA ma'lumotlari bilan butunlay o'chirish oynasi (superadmin).
 *
 * Avval serverdan xulosa olinadi: nima o'chadi (xodimlar, o'yinlar, bar, mijozlar,
 * qarzlar...) va nima saqlanadi (platforma to'lov tarixi). Tasdiq — klub nomini
 * aynan yozish: tugma faqat nom mos kelganda faollashadi (server ham shuni tekshiradi).
 */
const ClubDeleteModal = ({ club, onClose, onDeleted }: ClubDeleteModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [preview, setPreview] = useState<ClubDeletePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  /** Eskirgan javob (boshqa klub uchun ochilgan oyna) yangisining ustiga yozilmasin */
  const requestRef = useRef(0);

  const load = useCallback(async (target: Club) => {
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(false);
    setPreview(null);
    try {
      const res = await adminApi.deletePreview(target.id);
      if (request === requestRef.current) setPreview(res.data);
    } catch {
      if (request === requestRef.current) setLoadError(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTyped('');
    setDeleting(false);
    if (club) void load(club);
    else requestRef.current += 1;
  }, [club, load]);

  const matches = !!club && confirmNameMatches(typed, club.name);
  const canDelete = !!preview && matches && !deleting;

  const handleDelete = async () => {
    if (!club || !canDelete) return;
    setDeleting(true);
    try {
      const res = await adminApi.deleteClub(club.id, typed);
      message.success(res.message);
      onDeleted(club);
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setDeleting(false);
    }
  };

  const rows = preview ? clubDeleteRows(preview) : [];
  const sum = t('common.sum');

  return (
    <Modal
      open={!!club}
      title={
        <Space size={8}>
          <DeleteOutlined style={{ color: 'var(--ant-color-error)' }} aria-hidden />
          {t('adminClubs.purgeTitle')}
        </Space>
      }
      onCancel={() => {
        if (!deleting) onClose();
      }}
      maskClosable={!deleting}
      keyboard={!deleting}
      destroyOnHidden
      // Tafsilotlar drawer'idan ham ochiladi — har doim uning ustida tursin
      zIndex={1100}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={deleting}>
          {t('btn.cancel')}
        </Button>,
        <Button
          key="delete"
          type="primary"
          danger
          icon={<DeleteOutlined />}
          loading={deleting}
          disabled={!canDelete}
          onClick={() => void handleDelete()}
        >
          {t('adminClubs.purgeButton')}
        </Button>,
      ]}
    >
      {club && (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Alert type="error" showIcon message={t('adminClubs.purgeWarning', { name: club.name })} />

          {loading && <Skeleton active paragraph={{ rows: 4 }} title={false} />}

          {loadError && (
            <Alert
              type="warning"
              showIcon
              message={t('adminClubs.purgeLoadError')}
              action={
                <Button size="small" onClick={() => void load(club)}>
                  {t('admin.retry')}
                </Button>
              }
            />
          )}

          {preview && (
            <>
              <div>
                <Text strong>{t('adminClubs.purgeWillDelete')}</Text>
                {rows.length > 0 ? (
                  <dl className="club-delete__list">
                    {rows.map((row) => (
                      <div key={row.key} className="club-delete__row">
                        <dt>{t(`adminClubs.purge_${row.key}`)}</dt>
                        <dd className="tabular-nums">{formatNumber(row.count)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="club-delete__empty">
                    <Text type="secondary">{t('adminClubs.purgeNothing')}</Text>
                  </div>
                )}
              </div>

              {clubDeleteKeepsBilling(preview) && (
                <Alert
                  type="info"
                  showIcon
                  message={t('adminClubs.purgeKept')}
                  description={t('adminClubs.purgeKeptBilling', {
                    contracts: formatNumber(preview.billing.contracts),
                    amount: formatMoney(preview.billing.contractsAmount, sum),
                    invoices: formatNumber(preview.billing.paidInvoices),
                  })}
                />
              )}
              {preview.billing.unpaidInvoices > 0 && (
                <Text type="secondary">
                  {t('adminClubs.purgeUnpaid', { count: preview.billing.unpaidInvoices })}
                </Text>
              )}

              <div>
                <label htmlFor="club-delete-confirm" className="club-delete__label">
                  {t('adminClubs.purgeConfirmLabel')} <Text strong code>{club.name}</Text>
                </label>
                <Input
                  id="club-delete-confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onPressEnter={() => void handleDelete()}
                  placeholder={t('adminClubs.purgeConfirmPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  status={typed.trim() && !matches ? 'error' : undefined}
                  disabled={deleting}
                />
              </div>
            </>
          )}
        </Space>
      )}
    </Modal>
  );
};

export default ClubDeleteModal;
