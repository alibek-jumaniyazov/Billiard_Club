import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Input, Segmented, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { lightsApi } from '../../../api';
import { EmptyState } from '../../../components/ui';
import type { LightDeviceConfig, LightsOverview, TableLightConfig, TableLightPayload } from '../../../types';
import { lightErrorText } from './hub-errors';
import { lightCopy } from './light-copy';
import { lightDraftIssue, lightHealth, needsLightAttention } from './light-health';
import { draftConfig, toDraft, type TableDraft } from './shared';
import TableLightCard from './TableLightCard';

const { Text } = Typography;

const same = (a: TableDraft | undefined, b: TableDraft | undefined) => JSON.stringify(a) === JSON.stringify(b);

export interface LightAdvancedTablesProps {
  data: LightsOverview;
  /** Server soati bo'yicha "hozir" (ms) */
  now: number;
  canEdit: boolean;
  /** Mutatsiyadan oldin — ketayotgan davriy yuklashni bekor qilish */
  onBeforeMutate: () => void;
  /** Server qaytargan stol yozuvlarini ko'rinishga qo'shish */
  onUpdated: (rows: TableLightConfig[]) => void;
  /** Ko'rinishni jimgina qayta yuklash (+ stollar sahifasini yangilash) */
  onReload: () => void;
  /** Stol "Qurilmalar" ustasida sozlangan — o'sha qurilmani ochish */
  onOpenDevice: (tableId: number) => void;
}

/**
 * Stollar bo'yicha QO'LDA sozlash (tajribali foydalanuvchi uchun): MQTT/Zigbee,
 * Home Assistant, HTTP va maxsus buyruqlar. Oddiy relelar "Qurilmalar"
 * ustasida ulanadi.
 */
const LightAdvancedTables = ({ data, now, canEdit, onBeforeMutate, onUpdated, onReload, onOpenDevice }: LightAdvancedTablesProps) => {
  const { t, i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));
  const { message } = App.useApp();

  const [drafts, setDrafts] = useState<Record<number, TableDraft>>({});
  /** Qoralama qaysi server qiymatidan qurilgan — o'zgartirilmagan qoralama yangilanadi */
  const bases = useRef<Record<number, TableDraft>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [overridingId, setOverridingId] = useState<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, TableDraft> = {};
      for (const row of data.tables) {
        const fresh = toDraft(row);
        const current = prev[row.tableId];
        // Foydalanuvchi tegmagan qoralama serverdagi yangi qiymatga almashtiriladi
        // (masalan, stol "Qurilmalar" ustasida boshqa relega ko'chirilgan bo'lsa)
        const untouched = !current || same(current, bases.current[row.tableId]);
        next[row.tableId] = untouched ? fresh : current;
        if (untouched) bases.current[row.tableId] = fresh;
      }
      return next;
    });
  }, [data.tables]);

  const patchDraft = useCallback((tableId: number, patch: Partial<TableDraft>) => {
    setDrafts((prev) => (prev[tableId] ? { ...prev, [tableId]: { ...prev[tableId], ...patch } } : prev));
  }, []);

  const patchDraftConfig = useCallback((tableId: number, patch: Partial<LightDeviceConfig>) => {
    setDrafts((prev) =>
      prev[tableId] ? { ...prev, [tableId]: { ...prev[tableId], config: { ...prev[tableId].config, ...patch } } } : prev,
    );
  }, []);

  const resetDraft = (row: TableLightConfig) => {
    const fresh = toDraft(row);
    bases.current[row.tableId] = fresh;
    setDrafts((prev) => ({ ...prev, [row.tableId]: fresh }));
  };

  const saveTable = async (tableId: number) => {
    const draft = drafts[tableId];
    if (!draft || inFlight.current) return;
    const issue = lightDraftIssue(draft);
    if (issue) {
      message.warning(copy.issues[issue]);
      return;
    }
    inFlight.current = true;
    onBeforeMutate();
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
      // Parol/token FAQAT kiritilgan bo'lsa yuboriladi — bo'sh maydon saqlanganini o'chirmaydi
      const auth = draft.auth.trim();
      if (auth) payload.auth = auth;
      const res = await lightsApi.updateTable(tableId, payload);
      onUpdated([res.data]);
      resetDraft({ ...(data.tables.find((row) => row.tableId === tableId) as TableLightConfig), ...res.data });
      message.success(res.message);
      onReload();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      inFlight.current = false;
      setSavingId(null);
    }
  };

  const testTable = async (tableId: number, on: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    onBeforeMutate();
    setTestingId(tableId);
    try {
      const res = await lightsApi.test(tableId, on);
      if (res.data.queued) message.info(copy.queued);
      else if (res.data.ok) message.info(copy.accepted);
      else message.warning(res.data.error || res.message);
      onReload();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      inFlight.current = false;
      setTestingId(null);
    }
  };

  const overrideTable = async (tableId: number, on: boolean | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    onBeforeMutate();
    setOverridingId(tableId);
    try {
      const res = await lightsApi.override(tableId, on, on === null ? undefined : 60);
      message.success(res.message);
      onReload();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      inFlight.current = false;
      setOverridingId(null);
    }
  };

  const busy = savingId !== null || testingId !== null || overridingId !== null;
  const needle = query.trim().toLocaleLowerCase();
  const visible = data.tables.filter((row) => {
    if (needle && !`${row.tableNumber} ${row.tableName}`.toLocaleLowerCase().includes(needle)) return false;
    if (filter === 'all') return true;
    const health = lightHealth(row, data.mode, data.bridge.online, data.forceSyncSec, now);
    return filter === 'attention' ? needsLightAttention(health) : health === 'unconfigured';
  });

  return (
    <div className="light-advanced">
      <Text type="secondary" className="light-section-hint">{t('lights.advancedHint')}</Text>
      <div className="light-table-toolbar">
        <Input
          prefix={<SearchOutlined />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.search}
          aria-label={copy.search}
          allowClear
        />
        <Segmented
          value={filter}
          onChange={(value) => setFilter(String(value))}
          options={[
            { value: 'all', label: copy.all },
            { value: 'attention', label: copy.attention },
            { value: 'unconfigured', label: copy.health.unconfigured },
          ]}
        />
      </div>
      <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 12 }}>{copy.feedbackHint}</Text>

      {data.tables.length === 0 ? (
        <EmptyState title={t('tables.manageEmpty')} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={copy.nothing}
          action={<Button onClick={() => { setQuery(''); setFilter('all'); }}>{copy.reset}</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((row) => {
            const draft = drafts[row.tableId];
            if (!draft) return null;
            return (
              <TableLightCard
                key={row.tableId}
                row={row}
                draft={draft}
                mode={data.mode}
                bridgeOnline={data.bridge.online}
                forceSyncSec={data.forceSyncSec}
                serverNow={now}
                busy={busy}
                canEdit={canEdit}
                saving={savingId === row.tableId}
                testing={testingId === row.tableId}
                overriding={overridingId === row.tableId}
                onPatch={(patch) => patchDraft(row.tableId, patch)}
                onPatchConfig={(patch) => patchDraftConfig(row.tableId, patch)}
                onSave={() => void saveTable(row.tableId)}
                onReset={() => resetDraft(row)}
                onTest={(on) => void testTable(row.tableId, on)}
                onOverride={(on) => void overrideTable(row.tableId, on)}
                onOpenDevice={() => onOpenDevice(row.tableId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LightAdvancedTables;
