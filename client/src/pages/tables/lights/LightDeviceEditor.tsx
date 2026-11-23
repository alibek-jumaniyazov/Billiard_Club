import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Collapse,
  Grid,
  Input,
  InputNumber,
  Modal,
  Radio,
  Segmented,
  Select,
  Steps,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  BulbOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloudDownloadOutlined,
  ClusterOutlined,
  InfoCircleFilled,
  LoadingOutlined,
  PoweroffOutlined,
  UsbOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { lightsApi } from '../../../api';
import { desktopLights, type LightHubStatus, type TuyaCloudDevice } from '../../../offline/desktop';
import type { LightMode, TableLightConfig } from '../../../types';
import { hubControlsHere } from './board';
import {
  buildBulkPayload,
  DEVICE_KINDS,
  deviceKind,
  draftFromGroup,
  draftIssue,
  emptyDraft,
  fillSequential,
  type DeviceDraft,
  type DeviceGroup,
  type DeviceKindId,
  type FoundDevice,
} from './devices';
import { hubErrorText, isHubConfigPending, lightErrorText } from './hub-errors';
import { DRIVER_OPTIONS } from './shared';

const { Text } = Typography;

export type EditorStep = 'kind' | 'connection' | 'tables' | 'test';
const STEPS: readonly EditorStep[] = ['kind', 'connection', 'tables', 'test'];

/** Ustani ochish so'rovi */
export interface DeviceEditorRequest {
  /** Tahrirlanayotgan qurilma; yangi qurilmada null */
  group: DeviceGroup | null;
  /** Tur oldindan ma'lum (qidiruvdan) */
  kind?: DeviceKindId | null;
  /** Qidiruvdan kelgan boshlang'ich qiymatlar */
  prefill?: Partial<DeviceDraft>;
  /** Ochilganda ko'rsatiladigan qadam */
  step?: EditorStep;
  /** Faqat shu turlar taklif qilinadi (COM port: CH340 rele yoki RS485) */
  kinds?: DeviceKindId[];
}

interface TestState {
  status: 'running' | 'waiting' | 'ok' | 'sent' | 'queued' | 'error';
  on: boolean;
  actual?: boolean;
  text?: string;
  /** Buyruq yuborilgan vaqt (agent orqali sinovda natijani kutish uchun) */
  at?: number;
  /** Sinovdan oldingi stol yozuvi — agent javobi kelganini shu bilan bilamiz */
  prevSyncedAt?: string | null;
  prevError?: string | null;
}

/** Agent orqali sinovda javob shuncha vaqt ichida kelmasa, saqlangan xato ko'rsatiladi (ms) */
const AGENT_RESULT_GRACE_MS = 8000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const BAUD_RATES = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
const TUYA_VERSIONS = ['3.1', '3.3', '3.4', '3.5'] as const;
/** Tuya sinovidagi "buyruq bordi, holat o'zgarmadi / DP noto'g'ri" xatolari (markaz matnlari o'zbekcha) */
const TUYA_DP_ERROR_RE = /mos kelmadi|tasdiqlab bo|DP \d+/i;

export const kindIcon = (kind: DeviceKindId): ReactNode =>
  deviceKind(kind).wireless ? <WifiOutlined /> : kind.startsWith('usb') ? <UsbOutlined /> : <ClusterOutlined />;

/** Forma qatori: yorliq, boshqaruv va (ixtiyoriy) tushuntirish */
const Row = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <div className="light-form-row">
    <span className="light-form-label">{label}</span>
    {children}
    {hint && <span className="light-form-hint">{hint}</span>}
  </div>
);

/** Tuya IoT bulutidan qurilmalar va lokal kalitlarni olish (faqat kompyuter dasturida) */
const TuyaCloudImport = ({ onPick }: { onPick: (device: TuyaCloudDevice) => void }) => {
  const { t } = useTranslation();
  const hub = desktopLights();
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState('eu');
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<TuyaCloudDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hub) return <Text type="secondary">{t('lights.tuyaDesktopOnly')}</Text>;

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await hub.tuyaCloud({ accessId: accessId.trim(), accessSecret: accessSecret.trim(), region });
      setDevices(list);
      // Sir faqat shu so'rov uchun kerak edi — xotirada ushlab turmaymiz
      setAccessSecret('');
    } catch (err) {
      setError(hubErrorText(err) || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="light-tuya-cloud">
      <Text type="secondary" className="light-form-hint">{t('lights.tuyaCloudHint')}</Text>
      <div className="light-form-grid">
        <Row label={t('lights.tuyaAccessId')}>
          <Input value={accessId} maxLength={64} autoComplete="off" onChange={(e) => setAccessId(e.target.value)} />
        </Row>
        <Row label={t('lights.tuyaAccessSecret')}>
          <Input.Password value={accessSecret} maxLength={128} autoComplete="new-password" onChange={(e) => setAccessSecret(e.target.value)} />
        </Row>
        <Row label={t('lights.tuyaRegion')}>
          <Select
            value={region}
            onChange={setRegion}
            options={[
              { value: 'eu', label: t('lights.tuyaRegionEu') },
              { value: 'us', label: t('lights.tuyaRegionUs') },
              { value: 'cn', label: t('lights.tuyaRegionCn') },
              { value: 'in', label: t('lights.tuyaRegionIn') },
            ]}
          />
        </Row>
      </div>
      <Button
        icon={<CloudDownloadOutlined />}
        loading={loading}
        disabled={!accessId.trim() || !accessSecret.trim()}
        onClick={() => void fetchDevices()}
      >
        {t('lights.tuyaFetch')}
      </Button>
      {error && <Alert type="error" showIcon message={error} />}
      {devices &&
        (devices.length === 0 ? (
          <Text type="secondary">{t('lights.tuyaNone')}</Text>
        ) : (
          <Row label={t('lights.tuyaFound', { n: devices.length })}>
            <Select
              placeholder={t('lights.tuyaPick')}
              showSearch
              optionFilterProp="label"
              options={devices.map((device) => ({
                value: device.id,
                label: [device.name, device.productName].filter(Boolean).join(' · ') + (device.online === false ? ' (offline)' : ''),
              }))}
              onChange={(id: string) => {
                const device = devices.find((item) => item.id === id);
                if (device) onPick(device);
              }}
            />
          </Row>
        ))}
    </div>
  );
};

export interface LightDeviceEditorProps {
  /** null — oyna yopiq */
  request: DeviceEditorRequest | null;
  /** Klubning BARCHA stollari (GET /lights) */
  tables: TableLightConfig[];
  groups: DeviceGroup[];
  found: FoundDevice[];
  mode: LightMode;
  hubStatus: LightHubStatus | null;
  /** Klub agenti (bridge) onlayn */
  agentOnline: boolean;
  /** Saqlangandan keyin server qaytargan stol yozuvlari */
  onSaved: (rows: TableLightConfig[]) => void;
  onClose: () => void;
}

/**
 * QURILMA USTASI: turi -> ulanish -> kanal/stol jadvali -> sinov.
 * Bitta plata (masalan 8 kanalli) bir nechta stolga BITTA so'rov bilan
 * biriktiriladi; saqlangach har bir stol shu yerning o'zida sinab ko'riladi.
 */
const LightDeviceEditor = ({
  request,
  tables,
  groups,
  found,
  mode,
  hubStatus,
  agentOnline,
  onSaved,
  onClose,
}: LightDeviceEditorProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const compact = screens.sm === false;

  const [draft, setDraft] = useState<DeviceDraft>(() => emptyDraft('tuya'));
  const [step, setStep] = useState<EditorStep>('kind');
  /** Serverda HOZIR shu qurilmaga ulangan stollar */
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [fillStart, setFillStart] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, TestState>>({});
  /** Sinalgan stollar va qaysi yo'l bilan — "Tayyor"da avtomatikaga qaytariladi */
  const tested = useRef(new Map<number, 'hub' | 'server'>());
  /** Oxirgi saqlash boshlangan vaqt — markaz yangi sozlamani olganini bilish uchun */
  const savedAt = useRef(0);
  const hubRef = useRef(hubStatus);
  useEffect(() => {
    hubRef.current = hubStatus;
  }, [hubStatus]);

  useEffect(() => {
    if (!request) return;
    const kind = request.group?.kind ?? request.kind ?? null;
    const prefill = request.prefill ?? {};
    const base = request.group ? draftFromGroup(request.group) : emptyDraft(kind ?? 'tuya', prefill.channels?.length ?? 1);
    setDraft({ ...base, ...prefill, ...(kind ? { kind } : {}) });
    setStep(request.step ?? (kind ? 'connection' : 'kind'));
    setSavedIds(request.group ? request.group.tables.map((item) => item.row.tableId) : []);
    setSaved(request.group !== null);
    setDirty(false);
    setSaving(false);
    setShowIssue(false);
    setFillStart(null);
    setResults({});
    tested.current.clear();
    savedAt.current = 0;
  }, [request]);

  const kind = deviceKind(draft.kind);
  const issue = draftIssue(draft, savedIds);
  const tableIssue = issue === 'noTables' || issue === 'secretAgain';
  const connectionIssue = issue && !tableIssue ? issue : null;
  const hubLocal = mode === 'bridge' && hubControlsHere(hubStatus);
  const canTest = hubLocal || mode === 'direct' || (mode === 'bridge' && agentOnline);

  const activeTables = useMemo(
    () => tables.filter((row) => row.isActive).sort((a, b) => a.tableNumber - b.tableNumber),
    [tables],
  );
  const tableOptions = activeTables.map((row) => ({ value: row.tableId, label: `${row.tableNumber} · ${row.tableName}` }));
  const tableById = useMemo(() => new Map(tables.map((row) => [row.tableId, row])), [tables]);

  /** Stol hozir BOSHQA qurilmada bo'lsa — qaysi biri (ko'chirilishi haqida ogohlantirish) */
  const ownerLabel = (tableId: number): string | null => {
    if (savedIds.includes(tableId)) return null;
    const row = tableById.get(tableId);
    if (!row || row.driver === 'none') return null;
    const group = groups.find((item) => item.tables.some((entry) => entry.row.tableId === tableId));
    if (group) return `${deviceKind(group.kind).brand} ${group.address}`.trim();
    const option = DRIVER_OPTIONS.find((item) => item.value === row.driver);
    return option?.brand ?? (option?.i18nKey ? t(option.i18nKey) : row.driver);
  };

  const patch = (next: Partial<DeviceDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setDirty(true);
  };

  const chooseKind = (next: DeviceKindId) => {
    const prefill = request?.prefill ?? {};
    const count = Math.min(prefill.channels?.length ?? 1, deviceKind(next).maxChannels);
    setDraft({
      ...emptyDraft(next, count),
      ...prefill,
      kind: next,
      channels: Array.from({ length: count }, (_, index) => prefill.channels?.[index] ?? null),
    });
    setDirty(true);
    setShowIssue(false);
    setStep('connection');
  };

  const setChannelCount = (count: number) => {
    const size = Math.max(1, Math.min(Math.round(count) || 1, kind.maxChannels));
    setDraft((prev) => ({
      ...prev,
      channels: Array.from({ length: size }, (_, index) => prev.channels[index] ?? null),
      ...(prev.kind === 'sonoff' ? { sonoffOutlets: size > 1 } : {}),
    }));
    setDirty(true);
  };

  const setChannel = (index: number, tableId: number | null) => {
    setDraft((prev) => ({ ...prev, channels: prev.channels.map((value, i) => (i === index ? tableId : value)) }));
    setDirty(true);
  };

  /* ------------------------------------------------------------ Saqlash */

  const goTables = () => {
    if (connectionIssue) {
      setShowIssue(true);
      return;
    }
    setShowIssue(false);
    setStep('tables');
  };

  const save = async () => {
    if (issue) {
      setShowIssue(true);
      if (connectionIssue) setStep('connection');
      return;
    }
    if (saved && !dirty) {
      setStep('test');
      return;
    }
    setSaving(true);
    const startedAt = Date.now();
    try {
      const res = await lightsApi.updateTables(buildBulkPayload(draft, savedIds));
      savedAt.current = startedAt;
      setSavedIds(Array.from(new Set(draft.channels.filter((id): id is number => id !== null))));
      setDraft((prev) => ({ ...prev, secret: '', hasSecret: prev.hasSecret || prev.secret.trim().length > 0 }));
      setSaved(true);
      setDirty(false);
      setShowIssue(false);
      setResults({});
      onSaved(res.data);
      message.success(t('lights.saved'));
      setStep('test');
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  /* -------------------------------------------------------------- Sinov */

  const setResult = (tableId: number, state: TestState) => setResults((prev) => ({ ...prev, [tableId]: state }));

  /** Saqlangandan keyin markaz serverdan yangi sozlamani olguncha (≤8 s) kutamiz */
  const waitHubSync = async () => {
    if (!savedAt.current) return;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const cloud = hubRef.current?.hub?.cloud;
      const last = cloud?.lastOkAt ? Date.parse(cloud.lastOkAt) : 0;
      if (last >= savedAt.current || !cloud?.online) return;
      // eslint-disable-next-line no-await-in-loop
      await sleep(300);
    }
  };

  const runTest = async (tableId: number, on: boolean) => {
    const hub = desktopLights();
    try {
      if (hubLocal && hub) {
        setResult(tableId, { status: 'waiting', on });
        await waitHubSync();
        setResult(tableId, { status: 'running', on });
        for (let attempt = 0; ; attempt += 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const res = await hub.test(tableId, on);
            tested.current.set(tableId, 'hub');
            if (!res.ok) setResult(tableId, { status: 'error', on, text: res.error ?? t('common.error') });
            else if (res.actual === null) setResult(tableId, { status: 'sent', on });
            else setResult(tableId, { status: 'ok', on, actual: res.actual });
            return;
          } catch (err) {
            if (attempt < 6 && isHubConfigPending(hubErrorText(err))) {
              setResult(tableId, { status: 'waiting', on });
              // eslint-disable-next-line no-await-in-loop
              await sleep(1000);
              continue;
            }
            throw err;
          }
        }
      }
      setResult(tableId, { status: 'running', on });
      const before = tableById.get(tableId);
      const at = Date.now();
      const res = await lightsApi.test(tableId, on);
      tested.current.set(tableId, 'server');
      if (res.data.queued) {
        setResult(tableId, {
          status: 'queued', on, at, prevSyncedAt: before?.syncedAt ?? null, prevError: before?.error ?? null,
        });
      }
      else if (res.data.ok) setResult(tableId, { status: 'sent', on });
      else setResult(tableId, { status: 'error', on, text: res.data.error || res.message });
    } catch (err) {
      const text = lightErrorText(err, t('common.error'));
      setResult(tableId, { status: 'error', on, text: isHubConfigPending(text) ? t('lights.testNotReady') : text });
    }
  };

  /** Sinalgan stollarni avtomatik boshqaruvga qaytarish */
  const restoreAuto = async () => {
    const entries = Array.from(tested.current.entries());
    tested.current.clear();
    if (entries.length === 0) return;
    const hub = desktopLights();
    const hubIds = entries.filter(([, via]) => via === 'hub').map(([id]) => id);
    const serverIds = entries.filter(([, via]) => via === 'server').map(([id]) => id);
    await Promise.allSettled([
      ...(hubIds.length > 0 && hub ? [hub.override({ tableIds: hubIds, on: null })] : []),
      ...serverIds.map((id) => lightsApi.override(id, null)),
    ]);
  };

  const close = () => {
    void restoreAuto();
    onClose();
  };

  /* ------------------------------------------------------------- Render */

  const foundOfKind = found.filter((item) => item.kind === draft.kind);
  const foundSerial = found.filter((item) => item.key.startsWith('serial:'));
  const foundHid = found.filter((item) => item.kind === 'usb_hid');
  const secretPlaceholder = draft.hasSecret ? t('lights.secretKeep') : undefined;

  const applyFound = (key: string) => {
    const item = found.find((entry) => entry.key === key);
    if (!item) return;
    const { channels, ...rest } = item.prefill;
    patch(rest);
    if (channels && channels.length > draft.channels.length) setChannelCount(channels.length);
  };

  const secretInput = (label: string, hint?: string) => (
    <Row label={label} hint={hint}>
      <Input.Password
        value={draft.secret}
        maxLength={200}
        autoComplete="new-password"
        placeholder={secretPlaceholder}
        onChange={(e) => patch({ secret: e.target.value })}
      />
    </Row>
  );

  const hostInput = (
    <Row label={t('lights.fieldHost')} hint={t('lights.fieldHostHint')}>
      <Input
        value={draft.host}
        maxLength={120}
        placeholder="192.168.1.50"
        inputMode="decimal"
        onChange={(e) => patch({ host: e.target.value.trim() })}
      />
    </Row>
  );

  const modbusFields = (
    <>
      <Row label={t('lights.fieldUnitId')}>
        <InputNumber
          value={draft.unitId}
          min={draft.kind === 'modbus_tcp' && draft.framing === 'tcp' ? 0 : 1}
          max={247}
          onChange={(value) => patch({ unitId: value ?? 1 })}
          style={{ width: 140 }}
        />
      </Row>
      <Row label={t('lights.fieldModbusMode')}>
        <Radio.Group
          value={draft.modbusMode}
          onChange={(e) => patch({ modbusMode: e.target.value })}
          options={[
            { value: 'coil', label: t('lights.modbusCoil') },
            { value: 'register', label: t('lights.modbusRegister') },
          ]}
        />
      </Row>
    </>
  );

  const connectionStep = (
    <div className="light-form">
      <div className="light-kind-chosen">
        <span className="light-kind-icon">{kindIcon(draft.kind)}</span>
        <strong>{kind.brand}</strong>
        <Text type="secondary">{t(`lights.kind_${draft.kind}`)}</Text>
      </div>

      {kind.fields.includes('host') && foundOfKind.length > 0 && (
        <Row label={t('lights.pickFound')}>
          <Select
            placeholder={t('lights.pickFound')}
            options={foundOfKind.map((item) => ({ value: item.key, label: `${item.title} · ${item.address}` }))}
            onChange={applyFound}
          />
        </Row>
      )}

      {draft.kind === 'tuya' && (
        <>
          {hostInput}
          <Row label={t('lights.fieldDeviceId')}>
            <Input value={draft.deviceId} maxLength={40} autoComplete="off" onChange={(e) => patch({ deviceId: e.target.value.trim() })} />
          </Row>
          {secretInput(t('lights.fieldLocalKey'))}
          <Row label={t('lights.fieldTuyaVersion')}>
            <Segmented
              value={draft.tuyaVersion}
              options={TUYA_VERSIONS.map((value) => ({ value, label: value }))}
              onChange={(value) => patch({ tuyaVersion: value as DeviceDraft['tuyaVersion'] })}
            />
          </Row>
          <Row label={t('lights.fieldTuyaDp')} hint={t('lights.tuyaDpHint')}>
            <div className="light-dp-row">
              <InputNumber
                min={1}
                max={255}
                precision={0}
                value={draft.tuyaDp}
                aria-label={t('lights.fieldTuyaDp')}
                onChange={(value) => patch({ tuyaDp: typeof value === 'number' ? value : 1 })}
              />
              <Button size="small" type={draft.tuyaDp === 1 ? 'primary' : 'default'} onClick={() => patch({ tuyaDp: 1 })}>
                {t('lights.tuyaDpSwitch')}
              </Button>
              <Button size="small" type={draft.tuyaDp === 16 ? 'primary' : 'default'} onClick={() => patch({ tuyaDp: 16 })}>
                {t('lights.tuyaDpBreaker')}
              </Button>
            </div>
          </Row>
          <Alert type="info" showIcon message={t('lights.tuyaHelp')} />
          <Collapse
            ghost
            items={[{
              key: 'cloud',
              label: t('lights.tuyaCloud'),
              children: (
                <TuyaCloudImport
                  onPick={(device) => {
                    // Manzil: avval shu tarmoqdagi qidiruv natijasi (versiya ham ma'lum),
                    // bo'lmasa bulut bergan lokal IP (bulut faqat lokal manzilni qaytaradi)
                    const local = found.find((item) => item.kind === 'tuya' && item.prefill.deviceId === device.id);
                    const host = local?.address ?? device.ip;
                    // Yoqish DP i — bulut modelidan (kompyuter dasturi 1.4.3+); yo'q bo'lsa qo'lda tanlanadi
                    const dp = typeof device.switchDp === 'number' && device.switchDp >= 1 && device.switchDp <= 255
                      ? device.switchDp
                      : null;
                    patch({
                      deviceId: device.id,
                      secret: device.localKey,
                      ...(host ? { host } : {}),
                      ...(local?.prefill.tuyaVersion ? { tuyaVersion: local.prefill.tuyaVersion } : {}),
                      ...(dp ? { tuyaDp: dp } : {}),
                    });
                    message.success(dp ? t('lights.tuyaFilledDp', { dp }) : t('lights.tuyaFilled'));
                  }}
                />
              ),
            }]}
          />
        </>
      )}

      {draft.kind === 'sonoff' && (
        <>
          {hostInput}
          <Row label={t('lights.sonoffMode')}>
            <Radio.Group
              value={draft.sonoffEncrypt ? 'lan' : 'diy'}
              onChange={(e) => patch({ sonoffEncrypt: e.target.value === 'lan' })}
              options={[
                { value: 'diy', label: t('lights.sonoffDiy') },
                { value: 'lan', label: t('lights.sonoffLan') },
              ]}
            />
          </Row>
          <Row label={t('lights.fieldDeviceId')}>
            <Input value={draft.deviceId} maxLength={40} autoComplete="off" onChange={(e) => patch({ deviceId: e.target.value.trim() })} />
          </Row>
          {draft.sonoffEncrypt && secretInput(t('lights.fieldDeviceKey'))}
          <Alert type="info" showIcon message={t('lights.sonoffHelp')} />
        </>
      )}

      {draft.kind === 'shelly' && (
        <>
          {hostInput}
          <Row label={t('lights.shellyGen')}>
            <Segmented
              value={draft.shellyGen}
              options={[
                { value: 2, label: t('lights.shellyGen2') },
                { value: 1, label: t('lights.shellyGen1') },
              ]}
              onChange={(value) => patch({ shellyGen: value === 1 ? 1 : 2 })}
            />
          </Row>
          {secretInput(t('lights.fieldPassword'), t('lights.fieldPasswordHint'))}
        </>
      )}

      {draft.kind === 'tasmota' && (
        <>
          {hostInput}
          {secretInput(t('lights.fieldPassword'), t('lights.fieldPasswordHint'))}
        </>
      )}

      {draft.kind === 'esphome' && (
        <>
          {hostInput}
          <Row label={t('lights.fieldEntity')} hint={t('lights.fieldEntityHint')}>
            <Input value={draft.entity} maxLength={80} onChange={(e) => patch({ entity: e.target.value.trim() })} />
          </Row>
          {secretInput(t('lights.fieldPassword'), t('lights.fieldPasswordHint'))}
        </>
      )}

      {draft.kind === 'modbus_tcp' && (
        <>
          {hostInput}
          {modbusFields}
          <Row label={t('lights.fieldFraming')}>
            <Radio.Group
              value={draft.framing}
              onChange={(e) => patch({ framing: e.target.value })}
              options={[
                { value: 'tcp', label: t('lights.framingTcp') },
                { value: 'rtu', label: t('lights.framingRtu') },
              ]}
            />
          </Row>
        </>
      )}

      {(draft.kind === 'modbus_rtu' || draft.kind === 'usb_lcus') && (
        <Row label={t('lights.fieldSerialPort')} hint={t('lights.fieldSerialPortHint')}>
          <AutoComplete
            value={draft.serialPort}
            options={foundSerial.map((item) => ({ value: item.address, label: `${item.address} · ${item.title}` }))}
            onChange={(value: string) => patch({ serialPort: value.trim() })}
            placeholder="COM3"
          />
        </Row>
      )}

      {draft.kind === 'modbus_rtu' && (
        <>
          <div className="light-form-grid">
            <Row label={t('lights.fieldBaud')}>
              <Select
                value={draft.baudRate}
                onChange={(value: number) => patch({ baudRate: value })}
                options={BAUD_RATES.map((value) => ({ value, label: String(value) }))}
              />
            </Row>
            <Row label={t('lights.fieldParity')}>
              <Select
                value={draft.parity}
                onChange={(value: DeviceDraft['parity']) => patch({ parity: value })}
                options={[
                  { value: 'none', label: t('lights.parityNone') },
                  { value: 'even', label: t('lights.parityEven') },
                  { value: 'odd', label: t('lights.parityOdd') },
                ]}
              />
            </Row>
          </div>
          {modbusFields}
        </>
      )}

      {draft.kind === 'usb_hid' && (
        <Row label={t('lights.fieldSerialNumber')} hint={t('lights.fieldSerialNumberHint')}>
          <AutoComplete
            value={draft.serialNumber}
            options={foundHid
              .filter((item) => item.prefill.serialNumber)
              .map((item) => ({ value: item.prefill.serialNumber ?? '', label: `${item.prefill.serialNumber} · ${item.title}` }))}
            onChange={(value: string) => patch({ serialNumber: value.trim() })}
            placeholder="QAAMZ"
          />
        </Row>
      )}

      {showIssue && connectionIssue && <Alert type="warning" showIcon message={t(`lights.issue_${connectionIssue}`)} />}
    </div>
  );

  const tablesStep = (
    <div className="light-form">
      {kind.maxChannels > 1 && (
        <Row label={t('lights.channelsCount')}>
          <InputNumber
            value={draft.channels.length}
            min={1}
            max={kind.maxChannels}
            onChange={(value) => setChannelCount(value ?? 1)}
            style={{ width: 120 }}
          />
        </Row>
      )}
      <Text type="secondary" className="light-form-hint">{t('lights.channelsHint')}</Text>

      {draft.channels.length > 1 && (
        <div className="light-fill">
          <Text type="secondary" className="light-fill-label">{t('lights.fillFrom')}</Text>
          <Select<number>
            value={fillStart ?? undefined}
            placeholder={t('lights.fillStart')}
            showSearch
            optionFilterProp="label"
            options={tableOptions}
            onChange={setFillStart}
            className="light-fill-select"
          />
          <Button
            disabled={fillStart === null}
            onClick={() => {
              setDraft((prev) => fillSequential(prev, activeTables, fillStart));
              setDirty(true);
            }}
          >
            {t('lights.fillApply')}
          </Button>
          <Button
            type="text"
            onClick={() => {
              setDraft((prev) => ({ ...prev, channels: prev.channels.map(() => null) }));
              setDirty(true);
            }}
          >
            {t('lights.clearAll')}
          </Button>
        </div>
      )}

      <div className="light-channel-list">
        {draft.channels.map((tableId, index) => {
          const owner = tableId !== null ? ownerLabel(tableId) : null;
          return (
            <div className="light-channel-row" key={index}>
              <span className="light-channel-no" title={t('lights.channelN', { n: index + 1 })}>{index + 1}</span>
              <div className="light-channel-pick">
                <Select<number>
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('lights.channelEmpty')}
                  value={tableId ?? undefined}
                  options={tableOptions}
                  aria-label={t('lights.channelN', { n: index + 1 })}
                  onChange={(value) => setChannel(index, value ?? null)}
                />
                {owner && <Text type="warning" className="light-form-hint">{t('lights.movedFrom')}: {owner}</Text>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="light-inline-switch">
        <Switch size="small" checked={draft.inverted} onChange={(checked) => patch({ inverted: checked })} />
        <div>
          <Text>{t('lights.inverted')}</Text>
          <Text type="secondary" className="light-form-hint">{t('lights.invertedHint')}</Text>
        </div>
      </div>

      {issue === 'secretAgain' && secretInput(
        draft.kind === 'tuya' ? t('lights.fieldLocalKey') : draft.kind === 'sonoff' ? t('lights.fieldDeviceKey') : t('lights.fieldPassword'),
      )}
      {showIssue && issue && <Alert type="warning" showIcon message={t(`lights.issue_${issue}`)} />}
    </div>
  );

  /* Sinov: har STOL bo'yicha (stolning barcha kanallari birga yonadi) */
  const testRows = useMemo(() => {
    const byTable = new Map<number, number[]>();
    draft.channels.forEach((tableId, index) => {
      if (tableId !== null) byTable.set(tableId, [...(byTable.get(tableId) ?? []), index + 1]);
    });
    return Array.from(byTable.entries()).map(([tableId, channels]) => ({ tableId, channels }));
  }, [draft.channels]);

  /**
   * Agent orqali sinov: buyruq navbatga qo'yilgan, natija agent hisobotidan
   * keladi (oyna ma'lumoti har 5 soniyada yangilanadi). Muvaffaqiyatda stolning
   * `syncedAt` i yangilanadi, xatoda `error` paydo bo'ladi.
   */
  const liveResult = (tableId: number, state: TestState | undefined): TestState | undefined => {
    if (!state || state.status !== 'queued') return state;
    const row = tableById.get(tableId);
    if (!row) return state;
    if (row.syncedAt && row.syncedAt !== state.prevSyncedAt && !row.error) {
      return row.state === null ? { ...state, status: 'sent' } : { ...state, status: 'ok', actual: row.state };
    }
    if (row.error && (row.error !== state.prevError || Date.now() - (state.at ?? 0) > AGENT_RESULT_GRACE_MS)) {
      return { ...state, status: 'error', text: row.error };
    }
    return state;
  };

  const resultView = (state: TestState | undefined) => {
    if (!state) return null;
    switch (state.status) {
      case 'waiting':
        return <span className="light-test-result"><LoadingOutlined /> {t('lights.testWaiting')}</span>;
      case 'running':
        return <span className="light-test-result"><LoadingOutlined /></span>;
      case 'ok':
        return (
          <span className="light-test-result is-ok">
            <CheckCircleFilled /> {t('lights.testOk', { state: state.actual ? t('lights.stateOn') : t('lights.stateOff') })}
          </span>
        );
      case 'sent':
        return <span className="light-test-result is-info"><InfoCircleFilled /> {t('lights.testSent')}</span>;
      case 'queued':
        return <span className="light-test-result is-info"><InfoCircleFilled /> {t('lights.testQueued')}</span>;
      default:
        return <span className="light-test-result is-error"><CloseCircleFilled /> {t('lights.testFailed', { error: state.text ?? '' })}</span>;
    }
  };

  const testStep = (
    <div className="light-form">
      <Text>{t('lights.testIntro')}</Text>
      {!canTest && <Alert type="warning" showIcon message={t('lights.testNeedsController')} />}
      <div className="light-test-list">
        {testRows.map(({ tableId, channels }) => {
          const row = tableById.get(tableId);
          const state = liveResult(tableId, results[tableId]);
          const running = state?.status === 'running' || state?.status === 'waiting';
          return (
            <div className="light-test-row" key={tableId}>
              <div className="light-test-head">
                <span className="light-tile-number">{row?.tableNumber ?? '?'}</span>
                <div className="light-test-name">
                  <Text strong ellipsis>{row?.tableName ?? t('lights.tableN', { n: tableId })}</Text>
                  <Text type="secondary" className="light-form-hint">
                    {channels.map((n) => t('lights.channelN', { n })).join(', ')}
                  </Text>
                </div>
                <div className="light-test-actions">
                  <Button
                    size="small"
                    icon={<BulbOutlined />}
                    disabled={!canTest || (running && state?.on !== true)}
                    loading={running && state?.on === true}
                    onClick={() => void runTest(tableId, true)}
                  >
                    {t('lights.on')}
                  </Button>
                  <Button
                    size="small"
                    icon={<PoweroffOutlined />}
                    disabled={!canTest || (running && state?.on !== false)}
                    loading={running && state?.on === false}
                    onClick={() => void runTest(tableId, false)}
                  >
                    {t('lights.off')}
                  </Button>
                </div>
              </div>
              {resultView(state)}
              {draft.kind === 'tuya' && state?.status === 'error' && TUYA_DP_ERROR_RE.test(state.text ?? '') && (
                <Alert className="light-test-hint" type="info" showIcon message={t('lights.testTuyaDpHint')} />
              )}
            </div>
          );
        })}
      </div>
      <Text type="secondary" className="light-form-hint">{t('lights.testAfter')}</Text>
    </div>
  );

  const kinds = request?.kinds?.length ? DEVICE_KINDS.filter((item) => request.kinds?.includes(item.id)) : DEVICE_KINDS;
  const kindStep = (
    <div className="light-form">
      <Text strong>{t('lights.kindTitle')}</Text>
      <div className="light-kind-grid">
        {kinds.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`light-kind${draft.kind === item.id && step !== 'kind' ? ' is-active' : ''}`}
            onClick={() => chooseKind(item.id)}
          >
            <span className="light-kind-icon">{kindIcon(item.id)}</span>
            <span className="light-kind-body">
              <strong>{item.brand}</strong>
              <span>{t(`lights.kind_${item.id}`)}</span>
            </span>
            <Tag className="light-kind-tag">{item.wireless ? t('lights.wireless') : t('lights.wired')}</Tag>
          </button>
        ))}
      </div>
    </div>
  );

  const stepIndex = STEPS.indexOf(step);
  const editing = request?.group != null;
  const stepItems = STEPS.map((key, index) => ({
    // Tor ekranda (telefon) faqat joriy qadam nomi — 4 ta nom sig'maydi
    title: compact && index !== stepIndex ? undefined : t(`lights.step${key[0].toUpperCase()}${key.slice(1)}`),
    disabled:
      (key === 'kind' && editing) ||
      (index > stepIndex && !(key === 'test' && saved && !dirty)) ||
      saving,
  }));

  const footer = (() => {
    switch (step) {
      case 'kind':
        return [<Button key="cancel" onClick={close}>{t('btn.cancel')}</Button>];
      case 'connection':
        return [
          editing ? (
            <Button key="cancel" onClick={close}>{t('btn.cancel')}</Button>
          ) : (
            <Button key="back" onClick={() => setStep('kind')}>{t('lights.back')}</Button>
          ),
          <Button key="next" type="primary" onClick={goTables}>{t('lights.next')}</Button>,
        ];
      case 'tables':
        return [
          <Button key="back" disabled={saving} onClick={() => setStep('connection')}>{t('lights.back')}</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void save()}>{t('lights.saveAndTest')}</Button>,
        ];
      default:
        return [
          <Button key="back" onClick={() => setStep('tables')}>{t('lights.back')}</Button>,
          <Button key="done" type="primary" onClick={close}>{t('lights.done')}</Button>,
        ];
    }
  })();

  return (
    <Modal
      open={request !== null}
      title={editing ? t('lights.editorEdit') : t('lights.editorAdd')}
      onCancel={close}
      footer={footer}
      width={720}
      maskClosable={false}
      // Esc ochiq ro'yxatni yopish uchun bosiladi — kiritilgan sozlamalar yo'qolmasin
      keyboard={false}
      destroyOnHidden
      rootClassName="light-device-modal"
    >
      <Steps
        size="small"
        current={stepIndex}
        items={stepItems}
        onChange={(index) => setStep(STEPS[index])}
        className="light-steps"
        responsive={false}
        labelPlacement={compact ? 'horizontal' : 'vertical'}
      />
      {step === 'kind' ? kindStep : step === 'connection' ? connectionStep : step === 'tables' ? tablesStep : testStep}
    </Modal>
  );
};

export default LightDeviceEditor;
