import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Collapse, Drawer, Skeleton, Tabs, Tooltip } from 'antd';
import {
  ApiOutlined,
  BulbOutlined,
  ControlOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { isNetworkError, lightsApi } from '../../api';
import { EmptyState } from '../../components/ui';
import { desktopLights, type LightHubStatus } from '../../offline/desktop';
import type { LightSettingsPayload, LightsOverview, TableLightConfig } from '../../types';
import { buildBoardRows, hubControlsHere, lightController } from './lights/board';
import { groupDevices, type DeviceGroup } from './lights/devices';
import { lightErrorText } from './lights/hub-errors';
import LightAdvancedTables from './lights/LightAdvancedTables';
import LightControllerCard from './lights/LightControllerCard';
import LightDeviceEditor, { type DeviceEditorRequest } from './lights/LightDeviceEditor';
import LightDeviceList from './lights/LightDeviceList';
import LightEventsPanel from './lights/LightEventsPanel';
import LightRulesPanel from './lights/LightRulesPanel';
import LightStatusBoard, { type BoardBusy } from './lights/LightStatusBoard';
import { lightCopy } from './lights/light-copy';
import { useLightDiscovery } from './lights/useLightDiscovery';
import './lights/lights.css';

/** Oyna ochiq bo'lsa ko'rinish shu oraliqda JIMGINA yangilanadi (ms) */
const SILENT_REFRESH_MS = 5000;

/**
 * Yuklash rejimi:
 *  - `full` — skelet ko'rsatiladi;
 *  - `silent` — foydalanuvchi amalidan keyingi yangilash (sarlavhadagi tugma aylanadi);
 *  - `background` — davriy yangilash: UI da hech qanday belgi bermaydi.
 */
type LoadMode = 'full' | 'silent' | 'background';

type TabKey = 'status' | 'connect' | 'rules' | 'log';

interface LightSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Sozlama o'zgargandan keyin stollar ro'yxatini jimgina yangilash */
  onChanged: () => void;
}

/**
 * CHIROQ BOSHQARUVI oynasi — to'rt bo'lim:
 *  - Holat: kim boshqarayotgani, har stol chirog'i va qo'lda boshqarish;
 *  - Ulash: boshqaruvchi (shu kompyuter / agent), qurilmalar ustasi, qidiruv;
 *  - Qoidalar: pauza, kechikish, bron oldidan yoqish va h.k.;
 *  - Jurnal: diagnostika hodisalari.
 *
 * Internet bo'lmasa va kompyuterdagi chiroq markazi ishlayotgan bo'lsa, Holat
 * bo'limi markaz ma'lumoti bilan ishlayveradi va buyruqlar shu kompyuterdan
 * bajariladi.
 */
const LightSettingsDrawer = ({ open, onClose, onChanged }: LightSettingsDrawerProps) => {
  const { t, i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));
  const { message } = App.useApp();

  const [data, setData] = useState<LightsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<TabKey>('status');
  const [hubStatus, setHubStatus] = useState<LightHubStatus | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [boardBusy, setBoardBusy] = useState<BoardBusy>(null);
  const [editor, setEditor] = useState<DeviceEditorRequest | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const serverClockOffset = useRef(0);
  const requestVersion = useRef(0);
  const inFlight = useRef(0);
  /** Bo'lim foydalanuvchi tomonidan tanlanganmi (birinchi yuklashda avtomatik tanlanadi) */
  const tabChosen = useRef(false);

  /* ------------------------------------------------------------ Yuklash */

  const load = useCallback(
    async (mode: LoadMode = 'full') => {
      // Davriy yangilash navbat hosil qilmasin
      if (mode === 'background' && inFlight.current > 0) return;
      const version = ++requestVersion.current;
      inFlight.current += 1;
      if (mode === 'silent') setRefreshing(true);
      else if (mode === 'full') setLoading(true);
      try {
        const res = await lightsApi.overview();
        if (version !== requestVersion.current) return;
        serverClockOffset.current = Date.parse(res.data.serverNow) - Date.now();
        setClock(Date.now());
        setData(res.data);
        setLoadFailed(false);
        if (!tabChosen.current) {
          tabChosen.current = true;
          const configured = res.data.tables.some((row) => row.driver !== 'none');
          setTab(res.data.canEdit && (!configured || res.data.mode === 'off') ? 'connect' : 'status');
        }
      } catch (err) {
        if (version !== requestVersion.current) return;
        setLoadFailed(true);
        if (mode !== 'background' && !isNetworkError(err)) message.error(lightErrorText(err, t('common.error')));
      } finally {
        inFlight.current = Math.max(0, inFlight.current - 1);
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [message, t],
  );

  /* `load` tilga bog'liq — til almashganda effektlar qayta ishga tushmasin */
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!open) return;
    tabChosen.current = false;
    setTab('status');
    setEditor(null);
    setAdvancedOpen(false);
    void loadRef.current('full');
    return () => {
      requestVersion.current += 1;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setClock(Date.now());
      // Usta ochiq bo'lsa ham yangilanadi: sinov natijasi (agent hisoboti) shu yo'l bilan keladi.
      // Ustaning qoralamasi bunga bog'liq emas — u faqat ochilganda bir marta to'ldiriladi
      void loadRef.current('background');
    }, SILENT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);

  /* Kompyuterdagi chiroq markazi holati (faqat desktop dasturda) */
  useEffect(() => {
    const hub = desktopLights();
    if (!open || !hub) return;
    let alive = true;
    hub.status().then((status) => {
      if (alive) setHubStatus(status);
    }).catch(() => undefined);
    const unsubscribe = hub.onStatus((status) => setHubStatus(status));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [open]);

  /** Mutatsiyadan oldin: ketayotgan davriy yuklash eski ma'lumot bilan ustidan yozmasin */
  const invalidate = useCallback(() => {
    requestVersion.current += 1;
  }, []);

  const mergeRows = useCallback((rows: TableLightConfig[]) => {
    if (rows.length === 0) return;
    const byId = new Map(rows.map((row) => [row.tableId, row]));
    setData((prev) =>
      prev ? { ...prev, tables: prev.tables.map((row) => (byId.has(row.tableId) ? { ...row, ...byId.get(row.tableId) } : row)) } : prev,
    );
  }, []);

  const reloadAfterChange = useCallback(() => {
    onChanged();
    void loadRef.current('silent');
  }, [onChanged]);

  /* ------------------------------------------------------ Hisoblanganlar */

  const now = clock + serverClockOffset.current;
  const hubLocal = hubControlsHere(hubStatus);
  const offline = !data || loadFailed;
  const canEdit = data?.canEdit !== false;
  const rows = useMemo(() => buildBoardRows(data, hubStatus, now), [data, hubStatus, now]);
  const rowState = useMemo(() => new Map(rows.map((row) => [row.tableId, row])), [rows]);
  const controller = lightController(data?.mode ?? null, data, hubStatus);
  const { devices: groups } = useMemo(() => groupDevices(data?.tables ?? []), [data]);
  const canControl = !offline ? data?.mode !== 'off' : hubLocal;
  const discovery = useLightDiscovery(open, data?.bridge.online ?? false, t('common.error'));

  /* ------------------------------------------------------- Holat amallari */

  /**
   * Qo'lda boshqarish (bitta stol yoki hammasi). Avval server orqali — shunda
   * hamma qurilmalarda ko'rinadi; internet yo'q bo'lsa (yoki aynan shu so'rovda
   * uzilsa) buyruqni kompyuterdagi markaz bajaradi.
   */
  const runOverride = async (tableIds: number[] | null, on: boolean | null) => {
    if (boardBusy) return;
    const action = on === null ? 'auto' : on ? 'on' : 'off';
    setBoardBusy(tableIds ? `t:${tableIds[0]}:${action}` : `all:${action}`);
    const hub = desktopLights();
    const viaHub = async (): Promise<boolean> => {
      if (!hub || !hubLocal) return false;
      await hub.override({ tableIds, on, minutes });
      message.success(t('lights.localApplied'));
      return true;
    };
    try {
      if (offline) {
        if (!(await viaHub())) message.warning(t('lights.offlineNoHub'));
        return;
      }
      invalidate();
      const res = tableIds
        ? await lightsApi.override(tableIds[0], on, on === null ? undefined : minutes)
        : await lightsApi.master(on, on === null ? undefined : minutes);
      message.success(res.message);
      reloadAfterChange();
    } catch (err) {
      if (isNetworkError(err) && (await viaHub().catch(() => false))) return;
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setBoardBusy(null);
    }
  };

  /* ----------------------------------------------------- Ulash amallari */

  const saveSettings = async (patch: Partial<LightSettingsPayload>): Promise<boolean> => {
    if (!data) return false;
    setSettingsSaving(true);
    invalidate();
    try {
      const res = await lightsApi.updateSettings({ mode: data.mode, ...patch });
      setData((prev) => (prev ? { ...prev, ...res.data } : prev));
      message.success(res.message);
      reloadAfterChange();
      return true;
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
      return false;
    } finally {
      setSettingsSaving(false);
    }
  };

  const removeDevice = async (group: DeviceGroup) => {
    if (removingKey) return;
    setRemovingKey(group.key);
    invalidate();
    try {
      const res = await lightsApi.updateTables(
        group.tables.map(({ row }) => ({
          tableId: row.tableId,
          driver: 'none' as const,
          host: null,
          onUrl: null,
          offUrl: null,
          config: null,
          auth: null,
        })),
      );
      mergeRows(res.data);
      message.success(t('lights.removed'));
      reloadAfterChange();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setRemovingKey(null);
    }
  };

  const openDeviceOfTable = (tableId: number) => {
    const group = groups.find((item) => item.tables.some((entry) => entry.row.tableId === tableId));
    if (group) setEditor({ group });
  };

  /* -------------------------------------------------------------- Render */

  const goConnect = canEdit ? () => setTab('connect') : undefined;

  const statusTab = (
    <LightStatusBoard
      rows={rows}
      controller={controller}
      offline={offline}
      modeOff={data?.mode === 'off'}
      canControl={canControl}
      minutes={minutes}
      onMinutesChange={setMinutes}
      busy={boardBusy}
      onOverride={(tableId, on) => void runOverride([tableId], on)}
      onMaster={(on) => void runOverride(null, on)}
      onGoConnect={data ? goConnect : undefined}
    />
  );

  const needsInternet = (
    <EmptyState icon={<ApiOutlined />} title={t('tables.loadError')} hint={t('tables.loadErrorHint')} />
  );

  const items = [
    {
      key: 'status',
      label: (
        <span className="light-tab-label">
          <BulbOutlined />
          {t('lights.tabStatus')}
        </span>
      ),
      children: statusTab,
    },
    {
      key: 'connect',
      label: (
        <span className="light-tab-label">
          <ApiOutlined />
          {t('lights.tabConnect')}
        </span>
      ),
      children: data ? (
        <div className="light-stack">
          {!canEdit && <Alert type="info" showIcon message={t('tables.lightsReadOnly')} />}
          <LightControllerCard
            data={data}
            hubStatus={hubStatus}
            canEdit={canEdit}
            busy={settingsSaving}
            onSaveMode={(mode) => void saveSettings({ mode })}
            onChanged={reloadAfterChange}
          />
          {data.mode === 'direct' && <Alert type="info" showIcon message={copy.direct} />}
          <LightDeviceList
            groups={groups}
            canEdit={canEdit}
            discovery={discovery}
            rowState={rowState}
            removingKey={removingKey}
            onOpen={setEditor}
            onRemove={(group) => void removeDevice(group)}
          />
          <Collapse
            activeKey={advancedOpen ? ['advanced'] : []}
            onChange={(keys) => setAdvancedOpen((Array.isArray(keys) ? keys : [keys]).length > 0)}
            items={[
              {
                key: 'advanced',
                label: (
                  <span className="light-tab-label">
                    <ControlOutlined />
                    {t('lights.advancedTitle')}
                  </span>
                ),
                // Ko'p kartali ro'yxat faqat ochilganda chiziladi
                children: advancedOpen ? (
                  <LightAdvancedTables
                    data={data}
                    now={now}
                    canEdit={canEdit}
                    onBeforeMutate={invalidate}
                    onUpdated={mergeRows}
                    onReload={reloadAfterChange}
                    onOpenDevice={openDeviceOfTable}
                  />
                ) : null,
              },
            ]}
          />
        </div>
      ) : (
        needsInternet
      ),
    },
    {
      key: 'rules',
      label: (
        <span className="light-tab-label">
          <SettingOutlined />
          {t('lights.tabRules')}
        </span>
      ),
      children: data ? (
        <LightRulesPanel data={data} canEdit={canEdit} saving={settingsSaving} onSave={saveSettings} />
      ) : (
        needsInternet
      ),
    },
    {
      key: 'log',
      label: (
        <span className="light-tab-label">
          <HistoryOutlined />
          {t('lights.tabLog')}
        </span>
      ),
      // Jurnal FAQAT shu bo'lim ochilganda yuklanadi
      children: data ? tab === 'log' ? <LightEventsPanel /> : null : needsInternet,
    },
  ];

  const showSkeleton = loading && !data && !hubLocal;
  const showError = !loading && !data && !hubLocal;

  return (
    <Drawer
      rootClassName="light-control-drawer"
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
      {showSkeleton ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : showError ? (
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
        <>
          {data && loadFailed && <Alert type="warning" showIcon message={copy.pollingError} style={{ marginBottom: 12 }} />}
          <Tabs
            activeKey={tab}
            onChange={(key) => {
              tabChosen.current = true;
              setTab(key as TabKey);
            }}
            items={items}
            className="light-tabs"
          />
        </>
      )}

      {data && (
        <LightDeviceEditor
          request={editor}
          tables={data.tables}
          groups={groups}
          found={discovery.found}
          mode={data.mode}
          hubStatus={hubStatus}
          agentOnline={data.bridge.online}
          onSaved={(saved) => {
            invalidate();
            mergeRows(saved);
            onChanged();
          }}
          onClose={() => {
            setEditor(null);
            reloadAfterChange();
          }}
        />
      )}
    </Drawer>
  );
};

export default LightSettingsDrawer;
