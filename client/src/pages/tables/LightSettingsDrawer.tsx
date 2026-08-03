import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Drawer,
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
  HistoryOutlined,
  KeyOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, lightsApi } from '../../api';
import { EmptyState } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type {
  LightDeviceConfig,
  LightMode,
  LightSettingsPayload,
  LightsOverview,
  TableLightPayload,
} from '../../types';
import { formatDateTime } from '../../utils/format';
import LightDiscoverPanel from './lights/LightDiscoverPanel';
import LightEventsPanel from './lights/LightEventsPanel';
import TableLightCard from './lights/TableLightCard';
import {
  buildDrafts,
  draftConfig,
  MASTER_DURATIONS,
  panelStyle,
  toDraft,
  type TableDraft,
} from './lights/shared';

const { Text } = Typography;

/** Oyna ochiq bo'lsa ko'rinish shu oraliqda JIMGINA yangilanadi (ms) */
const SILENT_REFRESH_MS = 5000;

/** Qidiruvdan qoralama tushgan karta shuncha vaqt ajratilgan bo'lib turadi (ms) */
const HIGHLIGHT_MS = 6000;

/**
 * Yuklash rejimi:
 *  - `full` — skelet ko'rsatiladi, qoralamalar serverdagi qiymatga qaytadi;
 *  - `silent` — foydalanuvchi amalidan keyingi yangilash (sarlavhadagi tugma aylanadi);
 *  - `background` — davriy yangilash: UI da HECH QANDAY belgi bermaydi.
 */
type LoadMode = 'full' | 'silent' | 'background';

/** Klub sozlamalarining raqamli qoralamasi (blur da saqlanadi) */
interface NumbersDraft {
  offDelaySec: number;
  preOnMinutes: number;
  forceSyncSec: number;
}

/** Master boshqaruv tugmalaridan qaysi biri ishlayotgani */
type MasterBusy = 'on' | 'off' | 'auto' | null;

/** Sozlama qatori: chapda nom + tushuntirish, o'ngda boshqaruv */
const SettingRow = ({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: ReactNode;
}) => (
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
      <Text style={{ display: 'block' }}>{label}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {hint}
      </Text>
    </div>
    <div style={{ flexShrink: 0 }}>{control}</div>
  </div>
);

interface LightSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Sozlama o'zgargandan keyin stollar ro'yxatini jimgina yangilash */
  onChanged: () => void;
}

/**
 * Chiroq boshqaruvi — butunlay IXTIYORIY imkoniyat:
 * klub rejimi (o'chiq / lokal agent / to'g'ridan-to'g'ri) va vaqt qoidalari
 * (sessiya tugagach kechikish, bron oldidan yoqish, majburiy sinxronizatsiya,
 * holatni tekshirish), master boshqaruv, lokal agent tokeni va qurilma
 * qidirish, har bir stolning rele sozlamalari hamda diagnostika jurnali.
 *
 * Standart holatda rejim 'off' va barcha stollarda drayver 'none' — ya'ni bu
 * oyna ochilmaguncha hech narsa o'zgarmaydi.
 */
const LightSettingsDrawer = ({ open, onClose, onChanged }: LightSettingsDrawerProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [data, setData] = useState<LightsOverview | null>(null);
  const [drafts, setDrafts] = useState<Record<number, TableDraft>>({});
  const [numbers, setNumbers] = useState<NumbersDraft>({
    offDelaySec: 0,
    preOnMinutes: 0,
    forceSyncSec: 60,
  });
  /** Raqamli qoralama bir marta to'ldirilgan — jimgina yangilash uni bosmaydi */
  const numbersReady = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [overridingId, setOverridingId] = useState<number | null>(null);
  const [tokenIssuing, setTokenIssuing] = useState(false);
  // Yangi token — faqat xotirada va faqat bir marta ko'rsatiladi
  const [token, setToken] = useState<string | null>(null);
  const [masterMinutes, setMasterMinutes] = useState<number>(60);
  const [masterBusy, setMasterBusy] = useState<MasterBusy>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  /** Qidiruvdan qoralama tushgan stol — kartaga scroll qilib ajratamiz */
  const [highlightId, setHighlightId] = useState<number | null>(null);

  /** Stol kartalarining DOM tugunlari (scrollIntoView uchun) */
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Ayni damda ketayotgan so'rovlar SONI — sekin tarmoqda so'rovlar to'planmasin.
   * Oddiy bayroq yetmaydi: ustma-ust ketgan ikkita so'rovdan birinchisi tugashi
   * bilan bayroq tushib, davriy yangilash yana so'rov qo'shib yuborardi.
   */
  const inFlightRef = useRef(0);

  /**
   * Ko'rinishni yuklash. `full` dan boshqa rejimlarda skelet ko'rsatilmaydi va
   * foydalanuvchining SAQLANMAGAN o'zgarishlari o'chirilmaydi (faqat yangi
   * stollar uchun qoralama qo'shiladi).
   */
  const load = useCallback(
    async (mode: LoadMode = 'full') => {
      // Davriy yangilash navbat hosil qilmasin: oldingisi tugamagan bo'lsa o'tkazib yuboriladi
      if (inFlightRef.current > 0 && mode === 'background') return;
      const silent = mode !== 'full';
      inFlightRef.current += 1;
      if (mode === 'silent') setRefreshing(true);
      else if (mode === 'full') setLoading(true);
      try {
        const res = await lightsApi.overview();
        setData(res.data);
        setDrafts((prev) =>
          silent ? { ...buildDrafts(res.data.tables), ...prev } : buildDrafts(res.data.tables),
        );
        if (!silent || !numbersReady.current) {
          setNumbers({
            offDelaySec: res.data.offDelaySec,
            preOnMinutes: res.data.preOnMinutes,
            forceSyncSec: res.data.forceSyncSec,
          });
          numbersReady.current = true;
        }
      } catch (err) {
        if (!silent) message.error(errorMessage(err, t('common.error')));
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [message, t],
  );

  /**
   * `load` tarjima funksiyasiga (`t`) bog'liq — TIL almashtirilganda uning
   * havolasi yangilanadi. Effektlar shu havolaga bog'lansa, til almashishi
   * qayta yuklashni keltirib chiqarib, saqlanmagan qoralamalarni yo'q qilardi.
   */
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setEventsOpen(false);
    setHighlightId(null);
    numbersReady.current = false;
    void loadRef.current('full');
  }, [open]);

  /* Oyna ochiq turganda jimgina yangilash (grace/bron holati vaqt bilan o'zgaradi) */
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void loadRef.current('background'), SILENT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);

  /* Ajratish taymeri komponent yopilganda tozalanadi */
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  /** Stol kartasiga scroll qilib, uni qisqa vaqt ajratib ko'rsatish */
  const focusTable = useCallback((tableId: number) => {
    setHighlightId(tableId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    // Karta DOM ga chizilgandan keyin scroll qilamiz
    requestAnimationFrame(() => {
      cardRefs.current[tableId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const canEdit = data?.canEdit !== false;

  /* ------------------------------------------------------ Klub sozlamalari */

  /** Har qanday sozlama o'zgarishi — `mode` doim birga yuboriladi (DTO talabi) */
  const saveSettings = useCallback(
    async (patch: Partial<LightSettingsPayload>) => {
      if (!data) return;
      setSettingsSaving(true);
      try {
        const res = await lightsApi.updateSettings({ mode: data.mode, ...patch });
        setData((prev) => (prev ? { ...prev, ...res.data } : prev));
        setNumbers({
          offDelaySec: res.data.offDelaySec,
          preOnMinutes: res.data.preOnMinutes,
          forceSyncSec: res.data.forceSyncSec,
        });
        message.success(res.message);
        onChanged();
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
        // Xatoda qoralamani serverdagi haqiqiy qiymatga qaytaramiz
        setNumbers({
          offDelaySec: data.offDelaySec,
          preOnMinutes: data.preOnMinutes,
          forceSyncSec: data.forceSyncSec,
        });
      } finally {
        setSettingsSaving(false);
      }
    },
    [data, message, onChanged, t],
  );

  /**
   * Enter bosilganda maydon disabled bo'lib blur ham ishga tushadi — AYNI
   * qiymat ikki marta yuborilmasligi uchun oxirgi yuborilgani eslab qolinadi
   * (javob kelgach yozuv olib tashlanadi, shunda qayta urinish mumkin).
   */
  const sentNumbers = useRef<Partial<NumbersDraft>>({});

  /** Raqamli maydon — fokus yo'qolganda va faqat QIYMAT O'ZGARGAN bo'lsa saqlanadi */
  const commitNumber = (field: keyof NumbersDraft) => {
    if (!data || numbers[field] === data[field]) return;
    const value = numbers[field];
    if (sentNumbers.current[field] === value) return;
    sentNumbers.current[field] = value;
    const done = () => {
      if (sentNumbers.current[field] === value) delete sentNumbers.current[field];
    };
    if (field === 'offDelaySec') void saveSettings({ offDelaySec: value }).finally(done);
    else if (field === 'preOnMinutes') void saveSettings({ preOnMinutes: value }).finally(done);
    else void saveSettings({ forceSyncSec: value }).finally(done);
  };

  /* ------------------------------------------------------ Master boshqaruv */

  const runMaster = async (on: boolean | null) => {
    setMasterBusy(on === null ? 'auto' : on ? 'on' : 'off');
    try {
      const res = await lightsApi.master(on, on === null ? undefined : masterMinutes);
      message.success(res.message);
      void load('silent');
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setMasterBusy(null);
    }
  };

  /* ------------------------------------------------------------- Stollar */

  const patchDraft = useCallback((tableId: number, patch: Partial<TableDraft>) => {
    setDrafts((prev) => {
      const current = prev[tableId];
      if (!current) return prev;
      return { ...prev, [tableId]: { ...current, ...patch } };
    });
  }, []);

  const patchDraftConfig = useCallback((tableId: number, patch: Partial<LightDeviceConfig>) => {
    setDrafts((prev) => {
      const current = prev[tableId];
      if (!current) return prev;
      return { ...prev, [tableId]: { ...current, config: { ...current.config, ...patch } } };
    });
  }, []);

  const saveTable = async (tableId: number) => {
    const draft = drafts[tableId];
    if (!draft) return;
    setSavingId(tableId);
    try {
      const payload: TableLightPayload = {
        driver: draft.driver,
        host: draft.host.trim(),
        channel: draft.channel,
        inverted: draft.inverted,
        onUrl: draft.onUrl.trim(),
        offUrl: draft.offUrl.trim(),
        config: draftConfig(draft),
      };
      // Parol/token FAQAT kiritilgan bo'lsa yuboriladi — bo'sh maydon
      // serverdagi mavjud qiymatni o'chirib yubormaydi
      const auth = draft.auth.trim();
      if (auth) payload.auth = auth;

      const res = await lightsApi.updateTable(tableId, payload);
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
      void load('silent');
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTestingId(null);
    }
  };

  /** Qo'lda boshqaruv; on=null — chiroq avtomatik (sessiya) holatiga qaytadi */
  const overrideTable = async (tableId: number, on: boolean | null) => {
    setOverridingId(tableId);
    try {
      const res = await lightsApi.override(tableId, on);
      message.success(res.message);
      void load('silent');
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setOverridingId(null);
    }
  };

  /* -------------------------------------------------------- Lokal agent */

  const issueToken = async () => {
    setTokenIssuing(true);
    try {
      const res = await lightsApi.issueBridgeToken();
      setToken(res.data.token);
      message.success(res.message);
      void load('silent');
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

  const modeHint =
    data?.mode === 'bridge'
      ? t('tables.lightsModeBridgeHint')
      : data?.mode === 'direct'
        ? t('tables.lightsModeDirectHint')
        : t('tables.lightsModeOffHint');

  /* -------------------------------------------------------------- Render */

  return (
    <Drawer
      title={t('tables.lightsTitle')}
      open={open}
      onClose={onClose}
      width="min(880px, 100vw)"
      destroyOnHidden
      extra={
        <Tooltip title={t('btn.refresh')}>
          <Button
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={() => void load('silent')}
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
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load('full')}>
              {t('tables.retry')}
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!canEdit && <Alert type="info" showIcon message={t('tables.lightsReadOnly')} />}

          {/* -------------------------------------------------- Klub rejimi */}
          <div style={panelStyle}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('tables.lightsMode')}
            </Text>
            <Radio.Group
              value={data.mode}
              disabled={settingsSaving || !canEdit}
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => void saveSettings({ mode: e.target.value as LightMode })}
              options={[
                { value: 'off', label: t('tables.lightsModeOff') },
                { value: 'bridge', label: t('tables.lightsModeBridge') },
                { value: 'direct', label: t('tables.lightsModeDirect') },
              ]}
            />
            <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 8 }}>
              {modeHint}
            </Text>

            <SettingRow
              label={t('tables.lightsOffOnPause')}
              hint={t('tables.lightsOffOnPauseHint')}
              control={
                <Switch
                  checked={data.offOnPause}
                  loading={settingsSaving}
                  disabled={data.mode === 'off' || !canEdit}
                  onChange={(checked) => void saveSettings({ offOnPause: checked })}
                />
              }
            />

            <SettingRow
              label={t('tables.lightsOffDelay')}
              hint={t('tables.lightsOffDelayHint')}
              control={
                <InputNumber
                  value={numbers.offDelaySec}
                  min={0}
                  max={3600}
                  step={30}
                  disabled={data.mode === 'off' || !canEdit || settingsSaving}
                  addonAfter={t('tables.lightsSeconds')}
                  aria-label={t('tables.lightsOffDelay')}
                  onChange={(value) =>
                    setNumbers((prev) => ({ ...prev, offDelaySec: value ?? 0 }))
                  }
                  onBlur={() => commitNumber('offDelaySec')}
                  onPressEnter={() => commitNumber('offDelaySec')}
                  style={{ width: 140 }}
                />
              }
            />

            <SettingRow
              label={t('tables.lightsPreOn')}
              hint={t('tables.lightsPreOnHint')}
              control={
                <InputNumber
                  value={numbers.preOnMinutes}
                  min={0}
                  max={120}
                  disabled={data.mode === 'off' || !canEdit || settingsSaving}
                  addonAfter={t('tables.lightsMinutes')}
                  aria-label={t('tables.lightsPreOn')}
                  onChange={(value) =>
                    setNumbers((prev) => ({ ...prev, preOnMinutes: value ?? 0 }))
                  }
                  onBlur={() => commitNumber('preOnMinutes')}
                  onPressEnter={() => commitNumber('preOnMinutes')}
                  style={{ width: 140 }}
                />
              }
            />

            <SettingRow
              label={t('tables.lightsForceSync')}
              hint={t('tables.lightsForceSyncHint')}
              control={
                <InputNumber
                  value={numbers.forceSyncSec}
                  min={10}
                  max={3600}
                  step={10}
                  disabled={data.mode === 'off' || !canEdit || settingsSaving}
                  addonAfter={t('tables.lightsSeconds')}
                  aria-label={t('tables.lightsForceSync')}
                  onChange={(value) =>
                    setNumbers((prev) => ({ ...prev, forceSyncSec: value ?? 60 }))
                  }
                  onBlur={() => commitNumber('forceSyncSec')}
                  onPressEnter={() => commitNumber('forceSyncSec')}
                  style={{ width: 140 }}
                />
              }
            />

            <SettingRow
              label={t('tables.lightsVerify')}
              hint={t('tables.lightsVerifyHint')}
              control={
                <Switch
                  checked={data.verify}
                  loading={settingsSaving}
                  disabled={data.mode === 'off' || !canEdit}
                  onChange={(checked) => void saveSettings({ verify: checked })}
                />
              }
            />
          </div>

          {data.mode === 'off' && <Alert type="info" showIcon message={t('tables.lightsOffAlert')} />}

          {/* ---------------------------------------------- Master boshqaruv */}
          {data.mode !== 'off' && (
            <div style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>
                  <ThunderboltOutlined />
                </span>
                <Text strong>{t('tables.lightsMaster')}</Text>
              </div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>
                {t('tables.lightsMasterHint')}
              </Text>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Tooltip title={t('tables.lightsMasterDuration')}>
                  <Select<number>
                    value={masterMinutes}
                    onChange={setMasterMinutes}
                    aria-label={t('tables.lightsMasterDuration')}
                    options={MASTER_DURATIONS.map((n) => ({
                      value: n,
                      label: `${n} ${t('common.minutes')}`,
                    }))}
                    style={{ width: 132 }}
                  />
                </Tooltip>

                {/* Har bir amal uchun ALOHIDA tasdiq matni: muddat ham, oqibati
                    ham aytiladi — "hammasini o'chirish" faol o'yinlarga ham tegadi */}
                <Popconfirm
                  title={t('tables.lightsMasterConfirmOn', { n: masterMinutes })}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={() => void runMaster(true)}
                >
                  <Button icon={<BulbOutlined />} loading={masterBusy === 'on'}>
                    {t('tables.lightsMasterAllOn')}
                  </Button>
                </Popconfirm>

                <Popconfirm
                  title={t('tables.lightsMasterConfirmOff', { n: masterMinutes })}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void runMaster(false)}
                >
                  <Button icon={<PoweroffOutlined />} loading={masterBusy === 'off'}>
                    {t('tables.lightsMasterAllOff')}
                  </Button>
                </Popconfirm>

                <Popconfirm
                  title={t('tables.lightsMasterConfirmAuto')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={() => void runMaster(null)}
                >
                  <Button type="text" icon={<SyncOutlined />} loading={masterBusy === 'auto'}>
                    {t('tables.lightsMasterAuto')}
                  </Button>
                </Popconfirm>
              </div>
            </div>
          )}

          {/* ------------------------------------------------- Lokal agent */}
          {data.mode === 'bridge' && (
            <div style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>
                  <ApiOutlined />
                </span>
                <Text strong>{t('tables.lightsBridge')}</Text>
                <Tag
                  color={data.bridge.online ? 'success' : 'default'}
                  style={{ marginInlineEnd: 0 }}
                >
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

              {canEdit && (
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
              )}

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

              {/* Qurilma qidirish sehrgari — skanni lokal agent bajaradi */}
              {canEdit && (
                <LightDiscoverPanel
                  tables={data.tables}
                  bridgeOnline={data.bridge.online}
                  onAssigned={(applied) => {
                    // FAQAT biriktirilgan stol nuqtali yangilanadi — boshqa
                    // stollarning saqlanmagan qoralamalari o'chib ketmasin
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            tables: prev.tables.map((row) =>
                              row.tableId === applied.tableId ? { ...row, ...applied } : row,
                            ),
                          }
                        : prev,
                    );
                    setDrafts((prev) => ({ ...prev, [applied.tableId]: toDraft(applied) }));
                    focusTable(applied.tableId);
                    void load('silent');
                    onChanged();
                  }}
                  onPrefill={(tableId, driver, host) => {
                    // Serverga yuborilmaydi: qolgan maydonlarni foydalanuvchi
                    // kartada to'ldirib "Saqlash"ni bosadi
                    patchDraft(tableId, { driver, host });
                    focusTable(tableId);
                  }}
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
                  return (
                    /* O'rov div — qidiruvdan qoralama tushganda kartaga scroll qilish uchun */
                    <div
                      key={row.tableId}
                      ref={(el) => {
                        cardRefs.current[row.tableId] = el;
                      }}
                    >
                      <TableLightCard
                        row={row}
                        draft={draft}
                        mode={data.mode}
                        canEdit={canEdit}
                        highlight={highlightId === row.tableId}
                        saving={savingId === row.tableId}
                        testing={testingId === row.tableId}
                        overriding={overridingId === row.tableId}
                        onPatch={(patch) => patchDraft(row.tableId, patch)}
                        onPatchConfig={(patch) => patchDraftConfig(row.tableId, patch)}
                        onSave={() => void saveTable(row.tableId)}
                        onTest={(on) => void testTable(row.tableId, on)}
                        onOverride={(on) => void overrideTable(row.tableId, on)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* -------------------------------------------------- Diagnostika */}
          <Collapse
            activeKey={eventsOpen ? ['events'] : []}
            onChange={(keys) => setEventsOpen((Array.isArray(keys) ? keys : [keys]).length > 0)}
            items={[
              {
                key: 'events',
                label: (
                  <Space size={8}>
                    <HistoryOutlined />
                    <Text>{t('tables.lightsEvents')}</Text>
                  </Space>
                ),
                // Jurnal FAQAT ochilganda yuklanadi
                children: eventsOpen ? <LightEventsPanel /> : null,
              },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
};

export default LightSettingsDrawer;
