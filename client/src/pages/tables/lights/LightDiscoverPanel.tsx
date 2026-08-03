import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { LinkOutlined, RadarChartOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, lightsApi } from '../../../api';
import { TOKENS } from '../../../theme/tokens';
import type { DiscoveredDevice, LightDriver, TableLightConfig } from '../../../types';
import { formatDateTime } from '../../../utils/format';
import { canAssignDirectly, DRIVER_OPTIONS } from './shared';

const { Text } = Typography;

/** Skan ketayotganda natijani shu oraliqda qayta so'raymiz (ms) */
const POLL_MS = 3000;

export interface LightDiscoverPanelProps {
  /** Biriktirish uchun stollar ro'yxati */
  tables: TableLightConfig[];
  /** Agent onlayn emas — skan navbatga qo'yiladi, lekin bajarilmaydi */
  bridgeOnline: boolean;
  /** Qurilma stolga SAQLANDI — serverdan qaytgan yozuv bilan yangilash */
  onAssigned: (applied: TableLightConfig) => void;
  /**
   * Qurilma qo'shimcha maydon talab qiladi — serverga yubormasdan stol
   * kartasining QORALAMASIGA yozamiz (foydalanuvchi qolganini to'ldirib saqlaydi).
   */
  onPrefill: (tableId: number, driver: LightDriver, host: string) => void;
}

/**
 * Qurilma qidirish sehrgari: lokal agent klub tarmog'ini skanerlaydi,
 * topilgan relelar ro'yxati shu yerda ko'rinadi va bir bosishda stolga
 * biriktiriladi (drayver + manzil stolga yoziladi).
 */
const LightDiscoverPanel = ({
  tables,
  bridgeOnline,
  onAssigned,
  onPrefill,
}: LightDiscoverPanelProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [subnet, setSubnet] = useState('');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  /** Agent HAQIQATDA skanerlagan tarmoq (o'zi tanlagan bo'lsa ham) */
  const [scannedSubnet, setScannedSubnet] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  /** host -> tanlangan stol */
  const [targets, setTargets] = useState<Record<string, number | undefined>>({});
  const [assigning, setAssigning] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDiscovered = useCallback(async () => {
    try {
      const res = await lightsApi.discovered();
      if (!mountedRef.current) return;
      setDevices(res.data.devices);
      setScannedAt(res.data.scannedAt);
      setScannedSubnet(res.data.subnet ?? null);
      setRunning(res.data.running);
    } catch {
      // Qidiruv — qo'shimcha imkoniyat: xatosi asosiy panelni buzmaydi
    }
  }, []);

  useEffect(() => {
    void loadDiscovered();
  }, [loadDiscovered]);

  /* Skan ketayotganda natijani qayta so'raymiz */
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void loadDiscovered(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, loadDiscovered]);

  const startScan = async () => {
    setStarting(true);
    try {
      const res = await lightsApi.discover(subnet.trim() || undefined);
      if (res.data.queued) {
        setRunning(true);
        message.success(res.message);
      } else {
        message.warning(res.message);
      }
      void loadDiscovered();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setStarting(false);
    }
  };

  /**
   * Topilgan qurilmani stolga biriktirish.
   * Server ba'zi drayverlar uchun qo'shimcha maydon talab qiladi (esphome —
   * `entity`, http — onUrl/offUrl), shuning uchun ular SERVERGA YUBORILMAYDI:
   * manzil va tur stol kartasining qoralamasiga yoziladi va foydalanuvchi
   * qolgan maydonlarni to'ldirib "Saqlash"ni bosadi. Aks holda PUT doim 400
   * bilan tugardi.
   */
  const assign = async (device: DiscoveredDevice) => {
    const tableId = targets[device.host];
    if (!tableId) return;
    const driver: LightDriver = device.driver ?? 'http';

    if (!canAssignDirectly(driver)) {
      onPrefill(tableId, driver, device.host);
      message.info(t('tables.lightsDiscoverPrefilled'));
      return;
    }

    setAssigning(device.host);
    try {
      const res = await lightsApi.updateTable(tableId, { driver, host: device.host });
      message.success(res.message);
      onAssigned(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setAssigning(null);
    }
  };

  const driverLabel = (driver: LightDriver | undefined): string => {
    const opt = DRIVER_OPTIONS.find((item) => item.value === driver);
    if (!opt) return '—';
    return opt.brand ?? t(opt.i18nKey ?? '');
  };

  const tableOptions = tables.map((row) => ({
    value: row.tableId,
    label: `${row.tableNumber} · ${row.tableName}`,
  }));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>
          <RadarChartOutlined />
        </span>
        <Text strong>{t('tables.lightsDiscover')}</Text>
        {running && (
          <Tag color="processing" style={{ marginInlineEnd: 0 }}>
            {t('tables.lightsDiscoverRunning')}
          </Tag>
        )}
      </div>

      <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>
        {t('tables.lightsDiscoverHint')}
      </Text>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Input
          value={subnet}
          maxLength={20}
          placeholder="192.168.1"
          aria-label={t('tables.lightsDiscoverSubnet')}
          onChange={(e) => setSubnet(e.target.value)}
          style={{ flex: '1 1 160px', minWidth: 140 }}
        />
        {/* Disabled tugma ustida Tooltip ko'rinishi uchun span shart —
            aks holda sabab (agent oflayn) foydalanuvchiga yetmaydi */}
        <Tooltip title={bridgeOnline ? undefined : t('tables.lightsBridgeOffline')}>
          <span style={{ display: 'inline-flex' }}>
            <Button
              icon={<SearchOutlined />}
              loading={starting}
              disabled={!bridgeOnline}
              onClick={() => void startScan()}
            >
              {t('tables.lightsDiscover')}
            </Button>
          </span>
        </Tooltip>
      </div>

      {scannedAt && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
          {t('tables.lightsScannedAt')}: {formatDateTime(scannedAt)}
          {' · '}
          {t('tables.lightsDiscoverFound', { n: devices.length })}
          {/* Agent qaysi tarmoqni ko'rgani — noto'g'ri subnet tanlanganini darhol ko'rsatadi */}
          {scannedSubnet && (
            <>
              {' · '}
              {t('tables.lightsScannedSubnet', { subnet: scannedSubnet })}
            </>
          )}
        </Text>
      )}

      {devices.length === 0 ? (
        <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 10 }}>
          {running ? t('tables.lightsDiscoverRunning') : t('tables.lightsDiscoverEmpty')}
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {devices.map((device) => {
            const driver: LightDriver = device.driver ?? 'http';
            const direct = canAssignDirectly(driver);
            const target = targets[device.host];
            return (
              <div
                key={device.host}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  background: TOKENS.color.bg.bg2,
                  border: `1px solid ${TOKENS.color.border.subtle}`,
                  borderRadius: TOKENS.radius.sm,
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <Text strong style={{ display: 'block', fontSize: 13 }} className="tabular-nums">
                    {device.host}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                    {[device.name, device.model, device.mac].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </div>
                <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                  {driverLabel(device.driver)}
                </Tag>
                {typeof device.channels === 'number' && device.channels > 1 && (
                  <Tag style={{ marginInlineEnd: 0 }}>
                    {t('tables.lightsChannel')}: {device.channels}
                  </Tag>
                )}
                {/* Qo'shimcha maydon talab qiladigan drayver — biriktirish
                    qoralamaga yoziladi, serverga darhol yuborilmaydi */}
                {!direct && (
                  <Tag color="default" style={{ marginInlineEnd: 0 }}>
                    {t('tables.lightsDiscoverNeedsFields')}
                  </Tag>
                )}
                <Space size={6} wrap style={{ marginLeft: 'auto' }}>
                  <Select<number>
                    value={target}
                    options={tableOptions}
                    placeholder={t('tables.lightsDiscoverSelectTable')}
                    onChange={(value) =>
                      setTargets((prev) => ({ ...prev, [device.host]: value }))
                    }
                    style={{ width: 180 }}
                  />
                  <Tooltip
                    title={
                      !target
                        ? t('tables.lightsDiscoverSelectTable')
                        : direct
                          ? undefined
                          : t('tables.lightsDiscoverPrefilled')
                    }
                  >
                    <span style={{ display: 'inline-flex' }}>
                      <Button
                        size="small"
                        type="primary"
                        icon={<LinkOutlined />}
                        disabled={!target}
                        loading={assigning === device.host}
                        onClick={() => void assign(device)}
                      >
                        {t('tables.lightsDiscoverAssign')}
                      </Button>
                    </span>
                  </Tooltip>
                </Space>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LightDiscoverPanel;
