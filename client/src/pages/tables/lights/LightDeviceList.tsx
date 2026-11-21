import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  RadarChartOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui';
import { formatDateTime } from '../../../utils/format';
import type { BoardRow } from './board';
import { deviceKind, isFoundConnected, type DeviceGroup } from './devices';
import { kindIcon, type DeviceEditorRequest } from './LightDeviceEditor';
import { needsLightAttention } from './light-health';
import type { LightDiscovery } from './useLightDiscovery';

const { Text } = Typography;

export interface LightDeviceListProps {
  groups: DeviceGroup[];
  canEdit: boolean;
  discovery: LightDiscovery;
  /** Stol holati (Holat bo'limi bilan bir xil manba) — kanal belgisi rangi uchun */
  rowState: Map<number, BoardRow>;
  removingKey: string | null;
  onOpen: (request: DeviceEditorRequest) => void;
  onRemove: (group: DeviceGroup) => void;
}

/** Kanal belgisi rangi: yoniq / o'chiq / tekshirish kerak / noma'lum */
const dotClass = (state: BoardRow | undefined): string => {
  if (!state) return 'is-unknown';
  if (state.authMissing || (needsLightAttention(state.health) && state.health !== 'unconfirmed')) return 'is-attention';
  if (state.shown === true) return 'is-on';
  if (state.shown === false) return 'is-off';
  return 'is-unknown';
};

/**
 * QURILMALAR: har bir rele/plata — bitta karta (kanal -> stol), qidiruv va
 * topilgan qurilmani bir bosishda ustaga uzatish.
 */
const LightDeviceList = ({ groups, canEdit, discovery, rowState, removingKey, onOpen, onRemove }: LightDeviceListProps) => {
  const { t } = useTranslation();
  const [subnet, setSubnet] = useState('');

  return (
    <section className="light-section">
      <div className="light-section-head">
        <Text strong>{t('lights.devicesTitle')}</Text>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => onOpen({ group: null })}>
            {t('lights.addDevice')}
          </Button>
        )}
      </div>
      <Text type="secondary" className="light-section-hint">{t('lights.devicesHint')}</Text>

      {canEdit && (
        <div className="light-scan">
          <div className="light-scan-bar">
            <Button
              icon={<RadarChartOutlined />}
              loading={discovery.scanning}
              disabled={!discovery.available}
              onClick={() => void discovery.scan(subnet)}
            >
              {discovery.scanning ? t('lights.scanning') : t('lights.scan')}
            </Button>
            <Input
              value={subnet}
              maxLength={15}
              placeholder="192.168.1"
              aria-label={t('lights.scanSubnet')}
              title={t('lights.scanSubnet')}
              onChange={(e) => setSubnet(e.target.value)}
              className="light-scan-subnet"
            />
          </div>
          <Text type="secondary" className="light-form-hint">
            {discovery.available ? t('lights.scanHint') : t('lights.scanNeedsAgent')}
          </Text>
          {discovery.error && <Alert type="warning" showIcon message={discovery.error} />}
          {discovery.scannedAt && !discovery.scanning && (
            <Text type="secondary" className="light-form-hint">
              {t('tables.lightsScannedAt')}: {formatDateTime(discovery.scannedAt)} · {t('lights.scanFound', { n: discovery.found.length })}
              {discovery.subnet ? ` · ${t('tables.lightsScannedSubnet', { subnet: discovery.subnet })}` : ''}
            </Text>
          )}
          {discovery.scannedAt && !discovery.scanning && discovery.found.length === 0 && (
            <Text type="secondary" className="light-form-hint">{t('lights.scanNone')}</Text>
          )}
          {discovery.found.length > 0 && (
            <div className="light-found-list">
              {discovery.found.map((item) => {
                const connected = isFoundConnected(item, groups);
                const meta = [
                  item.kind ? deviceKind(item.kind).brand : 'COM',
                  item.address,
                  item.channels && item.channels > 1 ? t('lights.channelsN', { n: item.channels }) : null,
                  item.details,
                ].filter(Boolean);
                return (
                  <div key={item.key} className="light-found">
                    <span className="light-kind-icon">{item.kind ? kindIcon(item.kind) : <UsbOutlined />}</span>
                    <div className="light-found-body">
                      <Text strong ellipsis={{ tooltip: item.title }}>{item.title}</Text>
                      <Text type="secondary" className="light-form-hint">{meta.join(' · ')}</Text>
                    </div>
                    {connected ? (
                      <Tag color="success" style={{ marginInlineEnd: 0 }}>{t('lights.scanConnected')}</Tag>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        onClick={() =>
                          onOpen({
                            group: null,
                            kind: item.kind,
                            prefill: item.prefill,
                            kinds: item.kind ? undefined : ['usb_lcus', 'modbus_rtu'],
                          })
                        }
                      >
                        {t('lights.connect')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={<ApiOutlined />} title={t('lights.emptyDevices')} hint={canEdit ? t('lights.emptyDevicesHint') : undefined} />
      ) : (
        <div className="light-device-list">
          {groups.map((group) => {
            const kind = deviceKind(group.kind);
            const channels = group.tables
              .flatMap((item) => item.channels.map((channel) => ({ channel, row: item.row })))
              .sort((a, b) => a.channel - b.channel);
            return (
              <div key={group.key} className="light-device">
                <div className="light-device-head">
                  <span className="light-kind-icon">{kindIcon(group.kind)}</span>
                  <div className="light-device-title">
                    <Text strong>{kind.brand}</Text>
                    <Text type="secondary" className="light-form-hint">
                      {[group.address, kind.wireless ? t('lights.wireless') : t('lights.wired')].filter(Boolean).join(' · ')}
                    </Text>
                  </div>
                </div>
                <div className="light-device-channels">
                  {channels.map(({ channel, row }) => (
                    <span key={`${row.tableId}:${channel}`} className="light-chip">
                      <span className={`light-dot ${dotClass(rowState.get(row.tableId))}`} />
                      {t('lights.channelN', { n: channel + 1 })} → {t('lights.tableN', { n: row.tableNumber })}
                    </span>
                  ))}
                </div>
                {canEdit && (
                  <div className="light-device-actions">
                    <Button size="small" icon={<ExperimentOutlined />} onClick={() => onOpen({ group, step: 'test' })}>
                      {t('lights.test')}
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => onOpen({ group })}>
                      {t('lights.edit')}
                    </Button>
                    <Popconfirm
                      title={<span className="light-popconfirm-text">{t('lights.removeConfirm', { n: group.tables.length })}</span>}
                      okText={t('common.yes')}
                      cancelText={t('common.no')}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onRemove(group)}
                    >
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        loading={removingKey === group.key}
                        disabled={removingKey !== null}
                      >
                        {t('lights.remove')}
                      </Button>
                    </Popconfirm>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default LightDeviceList;
