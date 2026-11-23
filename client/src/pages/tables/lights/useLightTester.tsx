/**
 * Stol chirog'ini SINASH (qurilma ustasi va ommaviy ulash uchun umumiy).
 *  - Kompyuterdagi chiroq markazi shu yerda bo'lsa — to'g'ridan-to'g'ri markaz orqali
 *    (saqlangandan keyin markaz yangi sozlamani olguncha kutiladi);
 *  - aks holda server orqali (to'g'ridan-to'g'ri rejim) yoki klub agenti navbati bilan
 *    (natija agent hisobotidan — oyna ma'lumoti yangilanganda keladi).
 * Sinalgan stollar "Tayyor"da avtomatik boshqaruvga qaytariladi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleFilled, CloseCircleFilled, InfoCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { lightsApi } from '../../../api';
import { desktopLights, type LightHubStatus } from '../../../offline/desktop';
import type { LightMode, TableLightConfig } from '../../../types';
import { hubControlsHere } from './board';
import { hubErrorText, isHubConfigPending, lightErrorText } from './hub-errors';

export interface TestState {
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

/** Tuya sinovidagi "buyruq bordi, holat o'zgarmadi / DP noto'g'ri" xatolari (markaz matnlari o'zbekcha) */
export const TUYA_DP_ERROR_RE = /mos kelmadi|tasdiqlab bo|DP \d+/i;

export interface LightTester {
  /** Sinov mumkinmi: markaz shu yerda, to'g'ridan-to'g'ri rejim yoki onlayn agent */
  canTest: boolean;
  /** Stol bo'yicha natija (agent navbati javobi bilan birlashtirilgan) */
  resultOf: (tableId: number) => TestState | undefined;
  runTest: (tableId: number, on: boolean) => Promise<void>;
  /** Sinalgan stollarni avtomatik boshqaruvga qaytarish */
  restoreAuto: () => Promise<void>;
  /** Saqlash boshlangan vaqt — markaz yangi sozlamani olganini kutish uchun; natijalar tozalanadi */
  markSaved: (at: number) => void;
  /** Hammasini boshlang'ich holatga (oyna qayta ochilganda) */
  reset: () => void;
}

export function useLightTester({
  mode,
  hubStatus,
  agentOnline,
  tables,
}: {
  mode: LightMode;
  hubStatus: LightHubStatus | null;
  agentOnline: boolean;
  tables: readonly TableLightConfig[];
}): LightTester {
  const { t } = useTranslation();
  const [results, setResults] = useState<Record<number, TestState>>({});
  /** Sinalgan stollar va qaysi yo'l bilan */
  const tested = useRef(new Map<number, 'hub' | 'server'>());
  /** Oxirgi saqlash boshlangan vaqt */
  const savedAt = useRef(0);
  const hubRef = useRef(hubStatus);
  useEffect(() => {
    hubRef.current = hubStatus;
  }, [hubStatus]);

  const hubLocal = mode === 'bridge' && hubControlsHere(hubStatus);
  const canTest = hubLocal || mode === 'direct' || (mode === 'bridge' && agentOnline);
  const tableById = useMemo(() => new Map(tables.map((row) => [row.tableId, row])), [tables]);

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
      } else if (res.data.ok) setResult(tableId, { status: 'sent', on });
      else setResult(tableId, { status: 'error', on, text: res.data.error || res.message });
    } catch (err) {
      const text = lightErrorText(err, t('common.error'));
      setResult(tableId, { status: 'error', on, text: isHubConfigPending(text) ? t('lights.testNotReady') : text });
    }
  };

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

  /**
   * Agent orqali sinov: buyruq navbatga qo'yilgan, natija agent hisobotidan keladi.
   * Muvaffaqiyatda stolning `syncedAt` i yangilanadi, xatoda `error` paydo bo'ladi.
   */
  const resultOf = (tableId: number): TestState | undefined => {
    const state = results[tableId];
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

  const markSaved = useCallback((at: number) => {
    savedAt.current = at;
    setResults({});
  }, []);

  const reset = useCallback(() => {
    setResults({});
    tested.current.clear();
    savedAt.current = 0;
  }, []);

  return { canTest, resultOf, runTest, restoreAuto, markSaved, reset };
}

/** Sinov natijasi qatori */
export const TestResult = ({ state }: { state: TestState | undefined }) => {
  const { t } = useTranslation();
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
