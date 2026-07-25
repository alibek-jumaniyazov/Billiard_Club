import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  BulbOutlined,
  CopyOutlined,
  KeyOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, lightsApi } from '../../api';
import { EmptyState } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { LightDriver, LightMode, LightsOverview, TableLightConfig } from '../../types';
import { formatDateTime } from '../../utils/format';

const { Text } = Typography;

/** Bitta stolning tahrirlanayotgan sozlamalari (serverga shu maydonlar yuboriladi) */
interface TableDraft {
  driver: LightDriver;
  host: string;
  channel: number;
  inverted: boolean;
  onUrl: string;
  offUrl: string;
}

const toDraft = (row: TableLightConfig): TableDraft => ({
  driver: row.driver,
  host: row.host ?? '',
  channel: row.channel,
  inverted: row.inverted,
  onUrl: row.onUrl ?? '',
  offUrl: row.offUrl ?? '',
});

const buildDrafts = (tables: TableLightConfig[]): Record<number, TableDraft> =>
  Object.fromEntries(tables.map((row) => [row.tableId, toDraft(row)]));

/** Bo'lim yuzasi — ManageTablesDrawer dagi qator uslubi bilan bir xil */
const panelStyle: CSSProperties = {
  padding: 14,
  background: TOKENS.color.bg.bg1,
  border: `1px solid ${TOKENS.color.border.subtle}`,
  borderRadius: TOKENS.radius.md,
};

const numberStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: TOKENS.radius.sm,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  color: TOKENS.color.gold.base,
  background: TOKENS.color.gold.subtle,
  border: `1px solid ${TOKENS.color.gold.line}`,
};

interface LightSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Sozlama o'zgargandan keyin stollar ro'yxatini jimgina yangilash */
  onChanged: () => void;
}

/**
 * Chiroq boshqaruvi (faqat admin) — butunlay IXTIYORIY imkoniyat:
 * klub rejimi (o'chiq / lokal agent / to'g'ridan-to'g'ri), lokal agent tokeni va
 * har bir stolning rele sozlamalari. Standart holatda rejim 'off' va barcha
 * stollarda drayver 'none' — ya'ni bu oyna ochilmaguncha hech narsa o'zgarmaydi.
 */
const LightSettingsDrawer = ({ open, onClose, onChanged }: LightSettingsDrawerProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [data, setData] = useState<LightsOverview | null>(null);
  const [drafts, setDrafts] = useState<Record<number, TableDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [tokenIssuing, setTokenIssuing] = useState(false);
  // Yangi token — faqat xotirada va faqat bir marta ko'rsatiladi
  const [token, setToken] = useState<string | null>(null);

  /**
   * Ko'rinishni yuklash. `silent` — tugmalar bosilgandan keyingi yangilash:
   * skelet ko'rsatilmaydi va foydalanuvchining SAQLANMAGAN o'zgarishlari
   * o'chirilmaydi (faqat yangi stollar uchun qoralama qo'shiladi).
   */
  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await lightsApi.overview();
        setData(res.data);
        setDrafts((prev) =>
          silent ? { ...buildDrafts(res.data.tables), ...prev } : buildDrafts(res.data.tables),
        );
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [message, t],
  );

  useEffect(() => {
    if (!open) return;
    setToken(null);
    void load();
  }, [open, load]);

  /** Rejim va "pauzada o'chsin" — darhol saqlanadi (server ikkalasini birga oladi) */
  const saveSettings = async (mode: LightMode, offOnPause: boolean) => {
    setSettingsSaving(true);
    try {
      const res = await lightsApi.updateSettings({ mode, offOnPause });
      setData((prev) =>
        prev ? { ...prev, mode: res.data.mode, offOnPause: res.data.offOnPause } : prev,
      );
      message.success(res.message);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSettingsSaving(false);
    }
  };

  const patchDraft = (tableId: number, patch: Partial<TableDraft>) =>
    setDrafts((prev) => ({ ...prev, [tableId]: { ...prev[tableId], ...patch } }));

  const saveTable = async (tableId: number) => {
    const draft = drafts[tableId];
    if (!draft) return;
    setSavingId(tableId);
    try {
      const res = await lightsApi.updateTable(tableId, {
        driver: draft.driver,
        host: draft.host.trim(),
        channel: draft.channel,
        inverted: draft.inverted,
        onUrl: draft.onUrl.trim(),
        offUrl: draft.offUrl.trim(),
      });
      // Server javobi — yagona haqiqat manbai (holat/xato tozalangan bo'ladi)
      setData((prev) =>
        prev
          ? {
              ...prev,
              tables: prev.tables.map((row) =>
                row.tableId === tableId ? { ...row, ...res.data } : row,
              ),
            }
          : prev,
      );
      setDrafts((prev) => ({ ...prev, [tableId]: toDraft(res.data) }));
      message.success(res.message);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingId(null);
    }
  };

  const testTable = async (tableId: number, on: boolean) => {
    setTestingId(tableId);
    try {
      const res = await lightsApi.test(tableId, on);
      if (res.data.ok) message.success(res.message);
      else message.warning(res.message);
      // Haqiqiy natija stol yozuvida ko'rinadi (bridge rejimida bir necha soniyadan keyin)
      void load(true);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTestingId(null);
    }
  };

  /** Qo'lda boshqaruvni bekor qilish — chiroq avtomatik (sessiya) holatiga qaytadi */
  const clearOverride = async (tableId: number) => {
    try {
      const res = await lightsApi.override(tableId, null);
      message.success(res.message);
      void load(true);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const issueToken = async () => {
    setTokenIssuing(true);
    try {
      const res = await lightsApi.issueBridgeToken();
      setToken(res.data.token);
      message.success(res.message);
      void load(true);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTokenIssuing(false);
    }
  };

  const copyToken = () => {
    if (!token) return;
    void navigator.clipboard.writeText(token);
    message.success(t('tables.lightsCopied'));
  };

  const driverOptions = [
    { value: 'none', label: t('tables.lightsDriverNone') },
    { value: 'shelly_gen1', label: 'Shelly Gen1' },
    { value: 'shelly_gen2', label: 'Shelly Gen2 / Plus' },
    { value: 'tasmota', label: 'Tasmota' },
    { value: 'http', label: t('tables.lightsDriverHttp') },
  ];

  /** Oxirgi ma'lum holat: yoniq — sariq, o'chiq — kulrang, xato — qizil */
  const stateBadge = (row: TableLightConfig) => {
    const color = row.error
      ? TOKENS.color.semantic.error
      : row.state
        ? TOKENS.color.gold.base
        : TOKENS.color.text.tertiary;
    const label = row.error
      ? t('tables.lightsStateError')
      : row.state === null || row.state === undefined
        ? t('tables.lightsStateUnknown')
        : row.state
          ? t('tables.lightsStateOn')
          : t('tables.lightsStateOff');
    const hint =
      row.error ??
      (row.syncedAt ? `${t('tables.lightsSyncedAt')}: ${formatDateTime(row.syncedAt)}` : undefined);
    return (
      <Tooltip title={hint}>
        <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
          <BulbOutlined />
          {label}
        </span>
      </Tooltip>
    );
  };

  const modeHint =
    data?.mode === 'bridge'
      ? t('tables.lightsModeBridgeHint')
      : data?.mode === 'direct'
        ? t('tables.lightsModeDirectHint')
        : t('tables.lightsModeOffHint');

  return (
    <Drawer
      title={t('tables.lightsTitle')}
      open={open}
      onClose={onClose}
      width="min(680px, 100vw)"
      destroyOnHidden
      extra={
        <Tooltip title={t('btn.refresh')}>
          <Button
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={() => void load(true)}
            aria-label={t('btn.refresh')}
          />
        </Tooltip>
      }
    >
      {loading && !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data ? (
        <EmptyState
          icon={<BulbOutlined />}
          title={t('tables.loadError')}
          hint={t('tables.loadErrorHint')}
          action={
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()}>
              {t('tables.retry')}
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* -------------------------------------------------- Klub rejimi */}
          <div style={panelStyle}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('tables.lightsMode')}
            </Text>
            <Radio.Group
              value={data.mode}
              disabled={settingsSaving}
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => void saveSettings(e.target.value as LightMode, data.offOnPause)}
              options={[
                { value: 'off', label: t('tables.lightsModeOff') },
                { value: 'bridge', label: t('tables.lightsModeBridge') },
                { value: 'direct', label: t('tables.lightsModeDirect') },
              ]}
            />
            <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 8 }}>
              {modeHint}
            </Text>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Text style={{ display: 'block' }}>{t('tables.lightsOffOnPause')}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('tables.lightsOffOnPauseHint')}
                </Text>
              </div>
              <Switch
                checked={data.offOnPause}
                loading={settingsSaving}
                disabled={data.mode === 'off'}
                onChange={(checked) => void saveSettings(data.mode, checked)}
              />
            </div>
          </div>

          {data.mode === 'off' && (
            <Alert type="info" showIcon message={t('tables.lightsOffAlert')} />
          )}

          {/* ------------------------------------------------- Lokal agent */}
          {data.mode === 'bridge' && (
            <div style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>
                  <ApiOutlined />
                </span>
                <Text strong>{t('tables.lightsBridge')}</Text>
                <Tag color={data.bridge.online ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {data.bridge.online
                    ? t('tables.lightsBridgeOnline')
                    : t('tables.lightsBridgeOffline')}
                </Tag>
              </div>

              {data.bridge.exists ? (
                <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 8 }}>
                  {t('tables.lightsLastSeen')}: {formatDateTime(data.bridge.lastSeenAt)}
                  {' · '}
                  {t('tables.lightsAgentVersion')}: {data.bridge.agentVersion ?? '—'}
                </Text>
              ) : (
                <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 8 }}>
                  {t('tables.lightsBridgeNone')}
                </Text>
              )}

              <Popconfirm
                title={t('tables.lightsTokenConfirmTitle')}
                description={t('tables.lightsTokenConfirmDesc')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                onConfirm={() => void issueToken()}
              >
                <Button icon={<KeyOutlined />} loading={tokenIssuing} style={{ marginTop: 10 }}>
                  {t('tables.lightsIssueToken')}
                </Button>
              </Popconfirm>

              {token && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 10 }}
                  message={t('tables.lightsTokenOnce')}
                  description={
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Text code style={{ wordBreak: 'break-all' }}>
                        {token}
                      </Text>
                      <Space size={8}>
                        <Button size="small" icon={<CopyOutlined />} onClick={copyToken}>
                          {t('tables.lightsCopy')}
                        </Button>
                        <Button size="small" type="text" onClick={() => setToken(null)}>
                          {t('btn.close')}
                        </Button>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('tables.lightsTokenHint')}
                      </Text>
                    </Space>
                  }
                />
              )}
            </div>
          )}

          {/* ------------------------------------------------------ Stollar */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 10 }}>
              {t('tables.lightsTables')}
            </Text>

            {data.tables.length === 0 ? (
              <EmptyState icon={<BulbOutlined />} title={t('tables.manageEmpty')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.tables.map((row) => {
                  const draft = drafts[row.tableId];
                  if (!draft) return null;
                  const isHttp = draft.driver === 'http';
                  const configured = draft.driver !== 'none';
                  const testDisabled = !configured || data.mode === 'off';
                  const testHint = testDisabled
                    ? t('tables.lightsTestDisabled')
                    : t('tables.lightsTestHint');

                  return (
                    <div key={row.tableId} style={panelStyle}>
                      {/* Sarlavha: raqam + nom + oxirgi holat */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={numberStyle} className="tabular-nums">
                          {row.tableNumber}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text strong ellipsis style={{ display: 'block' }}>
                            {row.tableName}
                          </Text>
                          {stateBadge(row)}
                        </div>
                        {row.overrideActive && (
                          <Tooltip
                            title={`${t('tables.lightsOverrideUntil')}: ${formatDateTime(
                              row.overrideUntil,
                            )} · ${t('tables.lightsOverrideClear')}`}
                          >
                            <Tag
                              color="gold"
                              closable
                              style={{ marginInlineEnd: 0 }}
                              onClose={(e) => {
                                e.preventDefault();
                                void clearOverride(row.tableId);
                              }}
                            >
                              {row.overrideOn
                                ? t('tables.lightsOverrideOn')
                                : t('tables.lightsOverrideOff')}
                            </Tag>
                          </Tooltip>
                        )}
                      </div>

                      {/* Rele sozlamalari */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          marginTop: 10,
                          alignItems: 'center',
                        }}
                      >
                        <Select<LightDriver>
                          value={draft.driver}
                          options={driverOptions}
                          onChange={(value) => patchDraft(row.tableId, { driver: value })}
                          style={{ width: 176 }}
                        />
                        {configured && !isHttp && (
                          <Input
                            value={draft.host}
                            maxLength={120}
                            placeholder="192.168.1.51"
                            aria-label={t('tables.lightsHost')}
                            onChange={(e) => patchDraft(row.tableId, { host: e.target.value })}
                            style={{ flex: '1 1 150px', minWidth: 140 }}
                          />
                        )}
                        {configured && (
                          <Tooltip title={t('tables.lightsChannel')}>
                            <InputNumber
                              value={draft.channel}
                              min={0}
                              max={32}
                              aria-label={t('tables.lightsChannel')}
                              onChange={(value) =>
                                patchDraft(row.tableId, { channel: value ?? 0 })
                              }
                              style={{ width: 92 }}
                            />
                          </Tooltip>
                        )}
                      </div>

                      {configured && isHttp && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          <Input
                            value={draft.onUrl}
                            maxLength={500}
                            addonBefore={t('tables.lightsOnUrl')}
                            placeholder="http://192.168.1.51/relay/{channel}?turn=on"
                            onChange={(e) => patchDraft(row.tableId, { onUrl: e.target.value })}
                          />
                          <Input
                            value={draft.offUrl}
                            maxLength={500}
                            addonBefore={t('tables.lightsOffUrl')}
                            placeholder="http://192.168.1.51/relay/{channel}?turn=off"
                            onChange={(e) => patchDraft(row.tableId, { offUrl: e.target.value })}
                          />
                        </div>
                      )}

                      {/* Amallar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        {configured && (
                          <Space size={8}>
                            <Switch
                              size="small"
                              checked={draft.inverted}
                              onChange={(checked) =>
                                patchDraft(row.tableId, { inverted: checked })
                              }
                            />
                            <Text style={{ fontSize: 12.5 }}>{t('tables.lightsInverted')}</Text>
                          </Space>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          <Tooltip title={testHint}>
                            <Button
                              size="small"
                              icon={<BulbOutlined />}
                              disabled={testDisabled}
                              loading={testingId === row.tableId}
                              onClick={() => void testTable(row.tableId, true)}
                            >
                              {t('tables.lightsTestOn')}
                            </Button>
                          </Tooltip>
                          <Tooltip title={testHint}>
                            <Button
                              size="small"
                              icon={<PoweroffOutlined />}
                              disabled={testDisabled}
                              loading={testingId === row.tableId}
                              onClick={() => void testTable(row.tableId, false)}
                            >
                              {t('tables.lightsTestOff')}
                            </Button>
                          </Tooltip>
                          <Button
                            size="small"
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={savingId === row.tableId}
                            onClick={() => void saveTable(row.tableId)}
                          >
                            {t('btn.save')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default LightSettingsDrawer;
