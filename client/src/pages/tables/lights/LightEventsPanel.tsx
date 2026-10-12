import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Grid, Segmented, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, lightsApi } from '../../../api';
import { EmptyState } from '../../../components/ui';
import { TOKENS } from '../../../theme/tokens';
import type { LightEventView } from '../../../types';
import { formatDateTime } from '../../../utils/format';
import { EVENT_SOURCE_KEYS } from './shared';

const { Text } = Typography;

/** Jurnalda ko'rsatiladigan hodisalar soni */
const EVENTS_LIMIT = 50;

export interface LightEventsPanelProps {
  /** Faqat shu stolning hodisalari (berilmasa — butun klub) */
  tableId?: number;
}

/**
 * Diagnostika jurnali — chiroq qachon, nima sababdan va qanday natija bilan
 * o'zgargani. Panel ochilganda BIR MARTA yuklanadi (Collapse ichida).
 */
const LightEventsPanel = ({ tableId }: LightEventsPanelProps) => {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const screens = Grid.useBreakpoint();
  const { message } = App.useApp();

  const [rows, setRows] = useState<LightEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedOnly, setFailedOnly] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    const version = ++request.current;
    try {
      const res = await lightsApi.events({
        limit: EVENTS_LIMIT,
        ...(tableId !== undefined ? { tableId } : {}),
      });
      if (version !== request.current) return;
      setRows(res.data);
      setLoadError(false);
    } catch (err) {
      if (version !== request.current) return;
      setLoadError(true);
      message.error(errorMessage(err, t('common.error')));
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [message, t, tableId]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  const visibleRows = rows.filter((row) => !failedOnly || !row.ok);
  const columns: ColumnsType<LightEventView> = [
    {
      title: t('tables.lightsEventTime'),
      dataIndex: 'at',
      width: 150,
      render: (value: string) => (
        <Text style={{ fontSize: 12.5 }} className="tabular-nums">
          {formatDateTime(value)}
        </Text>
      ),
    },
    {
      title: t('common.table'),
      dataIndex: 'tableNumber',
      width: 130,
      render: (_: unknown, row) => (
        <Text style={{ fontSize: 12.5 }} ellipsis>
          {row.tableNumber} · {row.tableName}
        </Text>
      ),
    },
    {
      title: t('tables.lightsEventState'),
      dataIndex: 'isOn',
      width: 92,
      render: (value: boolean | null) =>
        value === null ? (
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            —
          </Text>
        ) : (
          <span style={{ color: value ? TOKENS.color.gold.base : TOKENS.color.text.tertiary }}>
            {value ? t('tables.lightsStateOn') : t('tables.lightsStateOff')}
          </span>
        ),
    },
    {
      title: t('tables.lightsEventSource'),
      dataIndex: 'source',
      width: 130,
      render: (value: string) => {
        const key = EVENT_SOURCE_KEYS[value];
        return <Tag style={{ marginInlineEnd: 0 }}>{key ? t(key) : value}</Tag>;
      },
    },
    {
      title: t('tables.lightsEventResult'),
      dataIndex: 'ok',
      render: (_: unknown, row) =>
        row.ok ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>
            {t('tables.lightsEventOk')}
          </Tag>
        ) : (
          <div>
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              {t('tables.lightsEventFail')}
            </Tag>
            {row.error && <Text type="danger" style={{ display: 'block', fontSize: 12, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{row.error}</Text>}
          </div>
        ),
    },
    {
      title: t('tables.lightsEventUser'),
      dataIndex: 'userName',
      width: 120,
      render: (value: string | null) => (
        <Text type="secondary" style={{ fontSize: 12.5 }} ellipsis>
          {value ?? '—'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('tables.lightsEventsHint')}
        </Text>
        <Tooltip title={t('btn.refresh')}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
            aria-label={t('btn.refresh')}
          />
        </Tooltip>
      </div>

      <Segmented style={{ marginBottom: 12 }} value={failedOnly ? 'errors' : 'all'} onChange={(value) => setFailedOnly(value === 'errors')} options={[
        { value: 'all', label: ru ? 'Все события' : 'Barcha hodisalar' },
        { value: 'errors', label: ru ? 'Ошибки' : 'Xatolar' },
      ]} />
      {loadError && <Alert type="warning" showIcon message={ru ? 'Не удалось обновить журнал.' : 'Jurnalni yangilab bo‘lmadi.'} style={{ marginBottom: 12 }} />}

      {!loading && visibleRows.length === 0 ? (
        <EmptyState title={t('tables.lightsEventsEmpty')} style={{ padding: '24px 12px' }} />
      ) : !screens.sm ? (
        <div className="light-event-cards" aria-busy={loading}>
          {visibleRows.map((row) => <article key={row.id} className="light-event-card">
            <div><Text strong>{row.tableNumber} · {row.tableName}</Text><Tag color={row.ok ? 'success' : 'error'}>{row.ok ? t('tables.lightsEventOk') : t('tables.lightsEventFail')}</Tag></div>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(row.at)} · {EVENT_SOURCE_KEYS[row.source] ? t(EVENT_SOURCE_KEYS[row.source]) : row.source}</Text>
            <div><Text>{row.isOn === null ? (ru ? 'Нет подтверждения' : 'Tasdiq yo‘q') : row.isOn ? t('tables.lightsStateOn') : t('tables.lightsStateOff')}</Text><Text type="secondary">{row.userName ?? '—'}</Text></div>
            {row.error && <Text type="danger" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{row.error}</Text>}
          </article>)}
        </div>
      ) : (
        <Table<LightEventView>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={visibleRows}
          pagination={false}
          scroll={{ x: 720, y: 320 }}
        />
      )}
    </div>
  );
};

export default LightEventsPanel;
