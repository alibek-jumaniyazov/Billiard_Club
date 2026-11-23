import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Input, InputNumber, Modal, Select, Steps, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  CloudDownloadOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { lightsApi } from '../../../api';
import { desktopLights, type LightHubStatus } from '../../../offline/desktop';
import type { LightMode, TableLightConfig } from '../../../types';
import type { DeviceGroup } from './devices';
import { hubErrorText, lightErrorText } from './hub-errors';
import { getTuyaCloudCache, setTuyaCloudCache } from './tuyaCloudCache';
import {
  autoFillTables,
  buildTuyaBulkPayload,
  mergeTuyaRows,
  rebaseAfterSave,
  refreshFromLan,
  rowIssue,
  sortByTable,
  type TuyaBulkIssue,
  type TuyaBulkRow,
  type TuyaVersion,
} from './tuyaBulk';
import type { LightDiscovery } from './useLightDiscovery';
import { TestResult, TUYA_DP_ERROR_RE, useLightTester } from './useLightTester';

const { Text } = Typography;

type BulkStep = 'source' | 'map' | 'test';
const STEPS: readonly BulkStep[] = ['source', 'map', 'test'];
const VERSIONS: readonly TuyaVersion[] = ['3.1', '3.3', '3.4', '3.5'];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LightTuyaBulkProps {
  open: boolean;
  /** Klubning BARCHA stollari (GET /lights) */
  tables: TableLightConfig[];
  groups: DeviceGroup[];
  discovery: LightDiscovery;
  mode: LightMode;
  hubStatus: LightHubStatus | null;
  agentOnline: boolean;
  onSaved: (rows: TableLightConfig[]) => void;
  onClose: () => void;
}

/**
 * TUYA QURILMALARINI BIRDAN ULASH: har Wi‑Fi automat (rele) — alohida stol.
 *  1) Ma'lumot: Access ID / Secret BIR MARTA (barcha kalitlar va DP lar bulutdan),
 *     IP va protokol versiyasi — tarmoq qidiruvidan;
 *  2) Moslash: har qurilmaga stol (Smart Life nomidan o'zi tanlanadi), IP, versiya, DP, kalit;
 *  3) Saqlash (bitta so'rov) va sinov: har stolni yoqib-o'chirish yoki ketma-ket sinash.
 */
const LightTuyaBulk = ({ open, tables, groups, discovery, mode, hubStatus, agentOnline, onSaved, onClose }: LightTuyaBulkProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const hub = desktopLights();

  const [step, setStep] = useState<BulkStep>('source');
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState('eu');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  /** Bulut va tarmoq qidiruvi tugagach ro'yxat yasaladi */
  const [pendingMerge, setPendingMerge] = useState(false);
  const [rows, setRows] = useState<TuyaBulkRow[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  /** Saqlashda xato topilsa — birinchi xatoli qatorga aylantiramiz */
  const [issueTick, setIssueTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [savedTables, setSavedTables] = useState<Array<{ tableId: number; label: string }>>([]);
  const [dpAll, setDpAll] = useState<number>(16);
  /** Ketma-ket sinov: nechanchi stol va qaysi biri sinalmoqda */
  const [sequence, setSequence] = useState<{ index: number; total: number; tableId: number } | null>(null);
  const testListRef = useRef<HTMLDivElement>(null);
  const stopSequence = useRef(false);
  const cloudRef = useRef(getTuyaCloudCache() ?? []);

  const tester = useLightTester({ mode, hubStatus, agentOnline, tables });
  const { reset: resetTester } = tester;

  useEffect(() => {
    if (!open) return;
    setStep('source');
    setFetching(false);
    setFetchError(null);
    setPendingMerge(false);
    setRows([]);
    setShowIssues(false);
    setSaving(false);
    setSavedTables([]);
    setSequence(null);
    setAccessSecret('');
    cloudRef.current = getTuyaCloudCache() ?? [];
    resetTester();
  }, [open, resetTester]);

  const activeTables = useMemo(
    () => tables.filter((row) => row.isActive).sort((a, b) => a.tableNumber - b.tableNumber),
    [tables],
  );
  const tableById = useMemo(() => new Map(tables.map((row) => [row.tableId, row])), [tables]);
  const tableOptions = activeTables.map((row) => ({ value: row.tableId, label: `${row.tableNumber} · ${row.tableName}` }));
  const lanTuya = discovery.found.filter((item) => item.kind === 'tuya');

  /* ---------------------------------------------------------- Ma'lumot */

  // Tarmoq qidiruvi tugagach (yoki kerak bo'lmasa darhol) — ro'yxat
  useEffect(() => {
    if (!pendingMerge || discovery.scanning) return;
    const merged = mergeTuyaRows({ cloud: cloudRef.current, found: discovery.found, groups, tables });
    // Stollar tartibida (1, 2, 3 …) — keyin foydalanuvchi o'zgartirsa qatorlar sakramaydi
    setRows(sortByTable(autoFillTables(merged, tables), tables));
    setPendingMerge(false);
    setFetching(false);
    setShowIssues(false);
    setStep('map');
  }, [pendingMerge, discovery.scanning, discovery.found, groups, tables]);

  const startMerge = async (scan: boolean) => {
    if (scan && discovery.available) await discovery.scan();
    setPendingMerge(true);
  };

  const fetchCloud = async () => {
    if (!hub) return;
    setFetching(true);
    setFetchError(null);
    try {
      const [list] = await Promise.all([
        hub.tuyaCloud({ accessId: accessId.trim(), accessSecret: accessSecret.trim(), region }),
        // IP va versiya uchun tarmoqni ham bir vaqtda tekshiramiz
        discovery.available ? discovery.scan() : Promise.resolve(),
      ]);
      setTuyaCloudCache(list);
      cloudRef.current = list;
      setAccessSecret('');
      setPendingMerge(true);
    } catch (err) {
      setFetchError(hubErrorText(err) || t('common.error'));
      setFetching(false);
    }
  };

  const applyCached = async () => {
    cloudRef.current = getTuyaCloudCache() ?? [];
    setFetching(true);
    await startMerge(lanTuya.length === 0);
  };

  const continueManual = async () => {
    cloudRef.current = [];
    setFetching(true);
    await startMerge(lanTuya.length === 0);
  };

  /**
   * Moslash bosqichida tarmoq qayta qidirilsa: IP va versiya yangilanadi, yangi topilgan
   * qurilmalar ro'yxatga qo'shiladi (kiritilgan kalit, stol va DP o'zgarmaydi)
   */
  useEffect(() => {
    if (step !== 'map' || discovery.scanning) return;
    setRows((prev) => refreshFromLan(prev, discovery.found));
  }, [step, discovery.scanning, discovery.found]);

  /* ----------------------------------------------------------- Moslash */

  const patchRow = (key: string, next: Partial<TuyaBulkRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...next } : row)));

  const issues = useMemo(() => new Map(rows.map((row) => [row.key, rowIssue(row, rows)])), [rows]);
  const selected = rows.filter((row) => row.include);
  const issueCount = selected.filter((row) => issues.get(row.key)).length;

  const ownerLabel = (row: TuyaBulkRow): string | null => {
    if (row.tableId === null || row.savedTableIds.includes(row.tableId)) return null;
    const table = tableById.get(row.tableId);
    if (!table || table.driver === 'none') return null;
    // Boshqa qurilmadan (shu ro'yxatda bo'lmagan) ko'chiriladi
    const own = rows.some((other) => other.include && other.savedTableIds.includes(row.tableId as number));
    if (own) return null;
    const group = groups.find((item) => item.tables.some((entry) => entry.row.tableId === row.tableId));
    return group ? group.address || table.driver : table.driver;
  };

  const issueText = (issue: TuyaBulkIssue) => (issue ? t(`lights.bulkIssue_${issue}`) : null);

  const save = async () => {
    if (selected.length === 0) return;
    if (issueCount > 0) {
      setShowIssues(true);
      setIssueTick((tick) => tick + 1);
      return;
    }
    setSaving(true);
    const startedAt = Date.now();
    try {
      const res = await lightsApi.updateTables(buildTuyaBulkPayload(rows));
      tester.markSaved(startedAt);
      onSaved(res.data);
      // "Orqaga" qaytib qayta saqlansa — endi serverdagi yangi holatdan hisoblanadi
      setRows((prev) => rebaseAfterSave(prev));
      const done = selected
        .filter((row) => row.tableId !== null)
        .map((row) => {
          const table = tableById.get(row.tableId as number);
          return {
            tableId: row.tableId as number,
            label: [row.name || t('lights.bulkUnnamed'), row.host].filter(Boolean).join(' · '),
            number: table?.tableNumber ?? 0,
          };
        })
        .sort((a, b) => a.number - b.number)
        .map(({ tableId, label }) => ({ tableId, label }));
      setSavedTables(done);
      message.success(t('lights.bulkSaved', { n: done.length }));
      setStep('test');
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (issueTick === 0) return;
    listRef.current?.querySelector('.light-bulk-row.has-issue')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [issueTick]);

  /* -------------------------------------------------------------- Sinov */

  const runSequence = async () => {
    stopSequence.current = false;
    for (let i = 0; i < savedTables.length; i += 1) {
      if (stopSequence.current) break;
      const { tableId } = savedTables[i];
      setSequence({ index: i + 1, total: savedTables.length, tableId });
      // eslint-disable-next-line no-await-in-loop
      await tester.runTest(tableId, true);
      // eslint-disable-next-line no-await-in-loop
      await sleep(1200);
      if (stopSequence.current) break;
      // eslint-disable-next-line no-await-in-loop
      await tester.runTest(tableId, false);
    }
    setSequence(null);
  };

  // Sinalayotgan stol ko'rinib tursin (ro'yxat uzun bo'lsa)
  const currentTableId = sequence?.tableId ?? null;
  useEffect(() => {
    if (currentTableId === null) return;
    testListRef.current
      ?.querySelector(`[data-table-id="${currentTableId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentTableId]);

  const close = () => {
    stopSequence.current = true;
    void tester.restoreAuto();
    onClose();
  };

  /* ------------------------------------------------------------- Render */

  const sourceStep = (
    <div className="light-form">
      <Text>{t('lights.bulkIntro')}</Text>
      {hub ? (
        <div className="light-tuya-cloud">
          <Text type="secondary" className="light-form-hint">{t('lights.bulkSourceIntro')}</Text>
          <div className="light-form-grid">
            <div className="light-form-row">
              <span className="light-form-label">{t('lights.tuyaAccessId')}</span>
              <Input value={accessId} maxLength={64} autoComplete="off" onChange={(e) => setAccessId(e.target.value)} />
            </div>
            <div className="light-form-row">
              <span className="light-form-label">{t('lights.tuyaAccessSecret')}</span>
              <Input.Password value={accessSecret} maxLength={128} autoComplete="new-password" onChange={(e) => setAccessSecret(e.target.value)} />
            </div>
            <div className="light-form-row">
              <span className="light-form-label">{t('lights.tuyaRegion')}</span>
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
            </div>
          </div>
          <div className="light-bulk-actions">
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={fetching}
              disabled={!accessId.trim() || !accessSecret.trim()}
              onClick={() => void fetchCloud()}
            >
              {fetching ? t('lights.bulkFetching') : t('lights.bulkFetch')}
            </Button>
            {getTuyaCloudCache() && !fetching && (
              <Button onClick={() => void applyCached()}>{t('lights.bulkUseCached', { n: getTuyaCloudCache()?.length ?? 0 })}</Button>
            )}
          </div>
          {fetchError && <Alert type="error" showIcon message={fetchError} />}
        </div>
      ) : (
        <Alert type="info" showIcon message={t('lights.bulkDesktopOnly')} />
      )}
      <div className="light-bulk-lan">
        <Text type="secondary" className="light-form-hint">
          {discovery.scanning ? t('lights.scanning') : t('lights.bulkLanCount', { n: lanTuya.length })}
        </Text>
        <Button size="small" icon={<RadarChartOutlined />} loading={discovery.scanning} disabled={!discovery.available} onClick={() => void discovery.scan()}>
          {t('lights.scan')}
        </Button>
      </div>
      {discovery.error && !discovery.scanning && <Text type="warning" className="light-form-hint">{discovery.error}</Text>}
      <Button type="link" className="light-bulk-manual" disabled={fetching} onClick={() => void continueManual()}>
        {t('lights.bulkManual')}
      </Button>
    </div>
  );

  const rowCard = (row: TuyaBulkRow) => {
    const issue = issues.get(row.key) ?? null;
    const owner = ownerLabel(row);
    const savedTable = row.savedTableIds.length ? tableById.get(row.savedTableIds[0]) : undefined;
    const keyHint = row.localKey
      ? row.keyFromCloud
        ? t('lights.bulkKeyCloud')
        : null
      : row.hasSavedKey && row.tableId !== null && row.savedTableIds.includes(row.tableId)
        ? t('lights.bulkKeySaved')
        : null;
    return (
      <div key={row.key} className={`light-bulk-row${row.include ? '' : ' is-off'}${showIssues && issue ? ' has-issue' : ''}`}>
        <div className="light-bulk-head">
          <Checkbox
            checked={row.include}
            disabled={row.multi}
            onChange={(e) => patchRow(row.key, { include: e.target.checked })}
            aria-label={row.name || row.deviceId}
          />
          <div className="light-bulk-title">
            <Text strong ellipsis={{ tooltip: row.name || row.deviceId }}>{row.name || t('lights.bulkUnnamed')}</Text>
            <Text type="secondary" className="light-form-hint">ID: {row.deviceId}</Text>
          </div>
          <div className="light-bulk-tags">
            {row.inCloud && <Tag color="blue">{t('lights.bulkCloudTag')}</Tag>}
            {row.inLan && <Tag color="green">{t('lights.bulkLanTag')}</Tag>}
            {row.online === false && <Tag>{t('lights.bulkOfflineTag')}</Tag>}
            {savedTable && <Tag color="gold">{t('lights.bulkSavedTag', { n: savedTable.tableNumber })}</Tag>}
          </div>
        </div>
        {row.multi ? (
          <Text type="secondary" className="light-form-hint">{t('lights.bulkMulti')}</Text>
        ) : (
          <div className="light-bulk-fields">
            <label className="light-bulk-field is-table">
              <span>{t('lights.bulkTable')}</span>
              <Select<number>
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('lights.channelEmpty')}
                value={row.tableId ?? undefined}
                options={tableOptions}
                disabled={!row.include}
                status={showIssues && (issue === 'table' || issue === 'dupTable') ? 'error' : undefined}
                onChange={(value) => patchRow(row.key, { tableId: value ?? null })}
              />
            </label>
            <label className="light-bulk-field">
              <span>{t('lights.fieldHost')}</span>
              <Input
                value={row.host}
                maxLength={60}
                placeholder="192.168.1.50"
                disabled={!row.include}
                status={showIssues && issue === 'host' ? 'error' : undefined}
                onChange={(e) => patchRow(row.key, { host: e.target.value.trim() })}
              />
            </label>
            <label className="light-bulk-field is-small">
              <span>{t('lights.fieldTuyaVersion')}</span>
              <Select<TuyaVersion>
                value={row.version}
                disabled={!row.include}
                options={VERSIONS.map((value) => ({ value, label: value }))}
                onChange={(value) => patchRow(row.key, { version: value })}
              />
            </label>
            <label className="light-bulk-field is-small">
              <span>{t('lights.fieldTuyaDp')}</span>
              <InputNumber
                min={1}
                max={255}
                precision={0}
                value={row.dp}
                disabled={!row.include}
                status={showIssues && issue === 'dp' ? 'error' : undefined}
                onChange={(value) => patchRow(row.key, { dp: typeof value === 'number' ? value : 1, dpFromCloud: false })}
              />
            </label>
            <label className="light-bulk-field is-key">
              <span>{t('lights.fieldLocalKey')}</span>
              <Input.Password
                value={row.localKey}
                maxLength={16}
                autoComplete="new-password"
                placeholder={keyHint ?? t('lights.bulkKeyPlaceholder')}
                disabled={!row.include}
                status={showIssues && issue === 'key' ? 'error' : undefined}
                onChange={(e) => patchRow(row.key, { localKey: e.target.value.trim(), keyFromCloud: false })}
              />
            </label>
          </div>
        )}
        {row.include && (keyHint || owner || (showIssues && issue)) && (
          <div className="light-bulk-notes">
            {keyHint && <Text type="success" className="light-form-hint">{keyHint}</Text>}
            {owner && <Text type="warning" className="light-form-hint">{t('lights.movedFrom')}: {owner}</Text>}
            {showIssues && issue && <Text type="danger" className="light-form-hint">{issueText(issue)}</Text>}
          </div>
        )}
      </div>
    );
  };

  const mapStep = (
    <div className="light-form">
      {rows.length === 0 ? (
        <Alert type="warning" showIcon message={t('lights.bulkNone')} />
      ) : (
        <>
          <div className="light-bulk-toolbar">
            <Text type="secondary">{t('lights.bulkSummary', { total: rows.length, selected: selected.length })}</Text>
            <div className="light-bulk-tools">
              <Button size="small" onClick={() => setRows((prev) => autoFillTables(prev, tables))}>{t('lights.bulkAutoFill')}</Button>
              <span className="light-bulk-dpall">
                <Text type="secondary">{t('lights.bulkDpAll')}</Text>
                <InputNumber size="small" min={1} max={255} precision={0} value={dpAll} onChange={(value) => setDpAll(typeof value === 'number' ? value : 16)} />
                <Button
                  size="small"
                  onClick={() => setRows((prev) => prev.map((row) => (row.include && !row.multi ? { ...row, dp: dpAll, dpFromCloud: false } : row)))}
                >
                  {t('lights.bulkApply')}
                </Button>
              </span>
              <Button size="small" icon={<RadarChartOutlined />} loading={discovery.scanning} disabled={!discovery.available} onClick={() => void discovery.scan()}>
                {t('lights.bulkRescan')}
              </Button>
            </div>
          </div>
          <Text type="secondary" className="light-form-hint">{t('lights.bulkMapHint')}</Text>
          {discovery.error && !discovery.scanning && <Text type="warning" className="light-form-hint">{discovery.error}</Text>}
          <div className="light-bulk-list" ref={listRef}>{rows.map(rowCard)}</div>
          {showIssues && issueCount > 0 && <Alert type="warning" showIcon message={t('lights.bulkIssues', { n: issueCount })} />}
        </>
      )}
    </div>
  );

  const testStep = (
    <div className="light-form">
      <Text>{t('lights.bulkTestIntro')}</Text>
      {!tester.canTest && <Alert type="warning" showIcon message={t('lights.testNeedsController')} />}
      <div className="light-bulk-toolbar">
        {sequence ? (
          <>
            <Text strong>{t('lights.bulkTestProgress', { i: sequence.index, n: sequence.total })}</Text>
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => { stopSequence.current = true; }}>
              {t('lights.bulkTestStop')}
            </Button>
          </>
        ) : (
          <Button type="primary" icon={<PlayCircleOutlined />} disabled={!tester.canTest || savedTables.length === 0} onClick={() => void runSequence()}>
            {t('lights.bulkTestAll')}
          </Button>
        )}
      </div>
      <div className="light-test-list" ref={testListRef}>
        {savedTables.map(({ tableId, label }) => {
          const table = tableById.get(tableId);
          const state = tester.resultOf(tableId);
          const running = state?.status === 'running' || state?.status === 'waiting';
          return (
            <div className={`light-test-row${currentTableId === tableId ? ' is-current' : ''}`} key={tableId} data-table-id={tableId}>
              <div className="light-test-head">
                <span className="light-tile-number">{table?.tableNumber ?? '?'}</span>
                <div className="light-test-name">
                  <Text strong ellipsis>{table?.tableName ?? t('lights.tableN', { n: tableId })}</Text>
                  <Text type="secondary" className="light-form-hint">{label}</Text>
                </div>
                <div className="light-test-actions">
                  <Button
                    size="small"
                    icon={<BulbOutlined />}
                    disabled={!tester.canTest || sequence !== null || (running && state?.on !== true)}
                    loading={running && state?.on === true}
                    onClick={() => void tester.runTest(tableId, true)}
                  >
                    {t('lights.on')}
                  </Button>
                  <Button
                    size="small"
                    icon={<PoweroffOutlined />}
                    disabled={!tester.canTest || sequence !== null || (running && state?.on !== false)}
                    loading={running && state?.on === false}
                    onClick={() => void tester.runTest(tableId, false)}
                  >
                    {t('lights.off')}
                  </Button>
                </div>
              </div>
              <TestResult state={state} />
              {state?.status === 'error' && TUYA_DP_ERROR_RE.test(state.text ?? '') && (
                <Alert className="light-test-hint" type="info" showIcon message={t('lights.testTuyaDpHint')} />
              )}
            </div>
          );
        })}
      </div>
      <Text type="secondary" className="light-form-hint">{t('lights.testAfter')}</Text>
    </div>
  );

  const stepIndex = STEPS.indexOf(step);
  const footer = (() => {
    if (step === 'source') return [<Button key="cancel" onClick={close}>{t('btn.cancel')}</Button>];
    if (step === 'map') {
      return [
        <Button key="back" disabled={saving} onClick={() => setStep('source')}>{t('lights.back')}</Button>,
        <Button key="save" type="primary" icon={<ThunderboltOutlined />} loading={saving} disabled={selected.length === 0} onClick={() => void save()}>
          {t('lights.bulkSave', { n: selected.length })}
        </Button>,
      ];
    }
    return [
      <Button key="back" disabled={sequence !== null} onClick={() => setStep('map')}>{t('lights.back')}</Button>,
      <Button key="done" type="primary" onClick={close}>{t('lights.done')}</Button>,
    ];
  })();

  return (
    <Modal
      open={open}
      title={t('lights.bulkTitle')}
      onCancel={close}
      footer={footer}
      width={980}
      maskClosable={false}
      keyboard={false}
      destroyOnHidden
      rootClassName="light-device-modal light-bulk-modal"
    >
      <Steps
        size="small"
        current={stepIndex}
        items={STEPS.map((key) => ({ title: t(`lights.bulkStep_${key}`) }))}
        className="light-steps"
        responsive={false}
      />
      {step === 'source' ? sourceStep : step === 'map' ? mapStep : testStep}
    </Modal>
  );
};

export default LightTuyaBulk;
