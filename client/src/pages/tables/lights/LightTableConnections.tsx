import { Alert, Button, Typography } from 'antd';
import { EditOutlined, LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TableLightConfig } from '../../../types';
import type { BoardRow } from './board';
import { deviceKind, kindOfTable, tuyaDpOf, type DeviceGroup } from './devices';
import { dotClass } from './LightDeviceList';
import { DRIVER_OPTIONS } from './shared';

const { Text } = Typography;

export interface LightTableConnectionsProps {
  tables: TableLightConfig[];
  groups: DeviceGroup[];
  rowState: Map<number, BoardRow>;
  canEdit: boolean;
  /** Tarmoqda topilgan, hali ulanmagan Tuya qurilmalari soni */
  tuyaUnconnected: number;
  onConnect: (tableId: number) => void;
  onOpenDevice: (tableId: number) => void;
  onBulk: () => void;
}

/**
 * STOLLAR BO'YICHA ULASH: har bir stol — o'z qatori. Ulanmagan stol bir bosishda ulanadi
 * (ustada shu stol oldindan tanlangan), ulangani tahrirlanadi; bir nechta Tuya qurilmasi
 * bo'lsa — hammasini bitta oynada ulash taklif qilinadi.
 */
const LightTableConnections = ({
  tables,
  groups,
  rowState,
  canEdit,
  tuyaUnconnected,
  onConnect,
  onOpenDevice,
  onBulk,
}: LightTableConnectionsProps) => {
  const { t } = useTranslation();
  const active = tables.filter((row) => row.isActive).sort((a, b) => a.tableNumber - b.tableNumber);
  const grouped = new Set(groups.flatMap((group) => group.tables.map((item) => item.row.tableId)));

  const describe = (row: TableLightConfig): string => {
    if (row.driver === 'none') return t('lights.tableNotConnected');
    const kind = kindOfTable(row);
    if (kind === 'tuya') {
      const dp = tuyaDpOf(row);
      return ['Tuya', row.host, dp !== 1 ? `DP ${dp}` : null].filter(Boolean).join(' · ');
    }
    if (kind) {
      const address = row.host || row.config?.serialPort || row.config?.serialNumber || '';
      return [deviceKind(kind).brand, address, row.channel > 0 ? t('lights.channelN', { n: row.channel + 1 }) : null].filter(Boolean).join(' · ');
    }
    const option = DRIVER_OPTIONS.find((item) => item.value === row.driver);
    return option?.brand ?? (option?.i18nKey ? t(option.i18nKey) : row.driver);
  };

  return (
    <section className="light-section">
      <div className="light-section-head">
        <Text strong>{t('lights.tablesTitle')}</Text>
        {canEdit && (
          <Button icon={<ThunderboltOutlined />} onClick={onBulk}>
            {t('lights.bulkOpen')}
          </Button>
        )}
      </div>
      <Text type="secondary" className="light-section-hint">{t('lights.tablesHint')}</Text>
      {canEdit && tuyaUnconnected >= 2 && (
        <Alert
          type="info"
          showIcon
          message={t('lights.bulkBanner', { n: tuyaUnconnected })}
          action={
            <Button size="small" type="primary" onClick={onBulk}>
              {t('lights.bulkOpen')}
            </Button>
          }
        />
      )}
      <div className="light-table-conn-list">
        {active.map((row) => {
          const configured = row.driver !== 'none';
          const inGroup = grouped.has(row.tableId);
          return (
            <div key={row.tableId} className={`light-table-conn${configured ? '' : ' is-empty'}`}>
              <span className="light-tile-number">{row.tableNumber}</span>
              <div className="light-table-conn-body">
                <Text strong ellipsis={{ tooltip: row.tableName }}>{row.tableName}</Text>
                <Text type="secondary" className="light-form-hint">
                  {configured && !inGroup ? `${describe(row)} · ${t('lights.tableAdvanced')}` : describe(row)}
                </Text>
              </div>
              {configured && <span className={`light-dot ${dotClass(rowState.get(row.tableId))}`} />}
              {canEdit &&
                (configured ? (
                  inGroup && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => onOpenDevice(row.tableId)}>
                      {t('lights.edit')}
                    </Button>
                  )
                ) : (
                  <Button size="small" type="primary" ghost icon={<LinkOutlined />} onClick={() => onConnect(row.tableId)}>
                    {t('lights.connect')}
                  </Button>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default LightTableConnections;
