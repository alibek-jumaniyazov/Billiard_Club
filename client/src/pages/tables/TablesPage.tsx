import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Col, Row, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  FireOutlined,
  HistoryOutlined,
  PieChartOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  TableOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, sessionsApi, tablesApi } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';
import {
  clockOffsetMs,
  initialSegmentOf,
  segmentsMatchSession,
  type SegmentLike,
} from '../../utils/session';
import CheckoutDrawer from './CheckoutDrawer';
import ManageTablesDrawer from './ManageTablesDrawer';
import OrderModal from './OrderModal';
import StartModal from './StartModal';
import TableCard from './TableCard';
import TransferModal from './TransferModal';

/** Stollar ro'yxatini jimgina yangilash davri (ms) */
const POLL_INTERVAL_MS = 15_000;

/**
 * STOLLAR SAHIFASI — mahsulot yuragi.
 *
 * Renderlash izolyatsiyasi: sahifaning O'ZI sekundlik tikka obuna EMAS —
 * useNow() faqat TableCard ichidagi ElapsedTime/LiveAmount barglari va
 * CheckoutDrawer'dagi LiveReceipt'da chaqiriladi. Kartalar React.memo bilan
 * o'ralgan, callbacklar barqaror (useCallback) — sahifa faqat poll/amal
 * natijasida qayta render bo'ladi.
 *
 * Drift yo'q: har poll'da offsetMs = serverNow - Date.now() hisoblanadi va
 * barcha jonli hisoblar Date.now() + offsetMs bilan yuritiladi.
 *
 * Pul segmentlar bo'yicha: transfer qilingan sessiyalarning jonli summasi
 * session_segments (kesh: segmentsMap) orqali serverdagi formulaning aynan
 * nusxasida hisoblanadi.
 */
const TablesPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole, club } = useAuth();

  const canCheckout = hasRole('admin', 'kassir', 'superadmin');
  const canManage = hasRole('admin', 'superadmin');

  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  // Amal bajarilayotgan sessiyalar (pause/resume/cancel) — parallel amallar
  // bir-birining loading holatini o'chirib yubormasligi uchun Set
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());

  // Segment keshi: sessionId -> segmentlar (transfer tarixi uchun)
  const segmentsRef = useRef<Record<number, SegmentLike[]>>({});
  const [segmentsMap, setSegmentsMap] = useState<Record<number, SegmentLike[]>>({});
  // Detali so'ralgan sessiyalar (takroriy so'rov bo'lmasin)
  const knownSessionsRef = useRef<Set<number>>(new Set());
  // Sessiya oxirgi ko'rilgan stoli — boshqa terminal transferini aniqlash uchun
  const lastTableRef = useRef<Map<number, number>>(new Map());

  const [startTable, setStartTable] = useState<BilliardTable | null>(null);
  const [orderTable, setOrderTable] = useState<BilliardTable | null>(null);
  const [transferTable, setTransferTable] = useState<BilliardTable | null>(null);
  const [checkoutTable, setCheckoutTable] = useState<BilliardTable | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageStartCreate, setManageStartCreate] = useState(false);

  const commitSegments = useCallback((next: Record<number, SegmentLike[]>) => {
    segmentsRef.current = next;
    setSegmentsMap(next);
  }, []);

  /**
   * Segment keshini yangi ro'yxat bilan solishtirish:
   *  - yo'q bo'lib ketgan sessiyalar keshdan olinadi;
   *  - notanish yoki stoli mos kelmaydigan (boshqa terminal transfer qilgan)
   *    sessiyalar uchun detal (segments bilan) bir marta so'raladi.
   */
  const syncSegments = useCallback(
    async (list: BilliardTable[]) => {
      const active = list.flatMap((tbl) => (tbl.sessions?.[0] ? [tbl.sessions[0]] : []));
      const activeIds = new Set(active.map((s) => s.id));

      const pruned: Record<number, SegmentLike[]> = {};
      let prunedCount = 0;
      for (const [id, segs] of Object.entries(segmentsRef.current)) {
        if (activeIds.has(Number(id))) pruned[Number(id)] = segs;
        else prunedCount += 1;
      }
      if (prunedCount > 0) commitSegments(pruned);
      knownSessionsRef.current = new Set(
        [...knownSessionsRef.current].filter((id) => activeIds.has(id)),
      );

      const needIds = active
        .filter((s) => {
          // Notanish sessiya — segmentlarini bir marta so'raymiz
          if (!knownSessionsRef.current.has(s.id)) return true;
          // Boshqa terminal transfer qilgan (stol o'zgargan) — yangilaymiz
          const prevTableId = lastTableRef.current.get(s.id);
          if (prevTableId !== undefined && prevTableId !== s.tableId) return true;
          // Keshdagi ochiq segment joriy stolga mos kelmasa — yangilaymiz
          // (bo'sh kesh = legacy sessiya, unda segment tekshiruvi yo'q)
          const segs = segmentsRef.current[s.id];
          return segs && segs.length > 0 ? !segmentsMatchSession(s, segs) : false;
        })
        .map((s) => s.id);

      lastTableRef.current = new Map(active.map((s) => [s.id, s.tableId]));
      if (needIds.length === 0) return;

      const results = await Promise.allSettled(needIds.map((id) => sessionsApi.detail(id)));
      const next = { ...segmentsRef.current };
      let changed = false;
      results.forEach((res, i) => {
        // Faqat MUVAFFAQIYATLI javob "tanish" deb belgilanadi — xatoda
        // keshsiz qolgan sessiyani keyingi poll (15s) qayta so'raydi,
        // transferdan keyin summa noto'g'ri qotib qolmaydi
        if (res.status !== 'fulfilled') return;
        knownSessionsRef.current.add(needIds[i]);
        if (res.value.data.segments) {
          next[needIds[i]] = res.value.data.segments;
          changed = true;
        }
      });
      if (changed) commitSegments(next);
    },
    [commitSegments],
  );

  const fetchTables = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await tablesApi.list();
        setTables(res.data);
        setOffsetMs(clockOffsetMs(res.serverNow));
        setLoadError(false);
        void syncSegments(res.data);
      } catch (err) {
        setLoadError(true);
        if (!silent) message.error(errorMessage(err, t('common.error')));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [message, t, syncSegments],
  );

  useEffect(() => {
    void fetchTables();
    const poll = setInterval(() => void fetchTables(true), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [fetchTables]);

  const silentRefresh = useCallback(() => void fetchTables(true), [fetchTables]);

  /* ------------------------------------------------------------- Amallar */

  /** Sessiyani pending to'plamiga qo'shish/olib tashlash */
  const markPending = useCallback((id: number, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handlePauseResume = useCallback(
    async (session: Session) => {
      markPending(session.id, true);
      try {
        const res =
          session.status === 'paused'
            ? await sessionsApi.resume(session.id)
            : await sessionsApi.pause(session.id);
        message.success(res.message);
        await fetchTables(true);
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        markPending(session.id, false);
      }
    },
    [fetchTables, markPending, message, t],
  );

  const handleCancel = useCallback(
    async (session: Session) => {
      markPending(session.id, true);
      try {
        const res = await sessionsApi.cancel(session.id);
        message.success(res.message);
        await fetchTables(true);
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        markPending(session.id, false);
      }
    },
    [fetchTables, markPending, message, t],
  );

  const handleStarted = useCallback(
    (session: Session) => {
      // Yangi sessiya — bitta ochiq segment, detal so'rovsiz keshga yozamiz
      knownSessionsRef.current.add(session.id);
      lastTableRef.current.set(session.id, session.tableId);
      const seg = initialSegmentOf(session);
      if (seg) commitSegments({ ...segmentsRef.current, [session.id]: seg });
      void fetchTables(true);
    },
    [commitSegments, fetchTables],
  );

  const handleTransferred = useCallback(
    (session: Session) => {
      knownSessionsRef.current.add(session.id);
      lastTableRef.current.set(session.id, session.tableId);
      if (session.segments && session.segments.length > 0) {
        commitSegments({ ...segmentsRef.current, [session.id]: session.segments });
      }
      void fetchTables(true);
    },
    [commitSegments, fetchTables],
  );

  const openStart = useCallback((table: BilliardTable) => setStartTable(table), []);
  const openOrder = useCallback((table: BilliardTable) => setOrderTable(table), []);
  const openTransfer = useCallback((table: BilliardTable) => setTransferTable(table), []);
  const openCheckout = useCallback((table: BilliardTable) => setCheckoutTable(table), []);

  const openManage = useCallback((startCreate: boolean) => {
    setManageStartCreate(startCreate);
    setManageOpen(true);
  }, []);

  /* ---------------------------------------------------------- Statistika */

  const busyCount = useMemo(() => tables.filter((tbl) => tbl.status === 'busy').length, [tables]);
  const freeCount = tables.length - busyCount;
  const occupancy = tables.length > 0 ? Math.round((busyCount / tables.length) * 100) : 0;
  const todayGames = useMemo(
    () => tables.reduce((sum, tbl) => sum + (tbl.todayCompletedSessions ?? 0), 0),
    [tables],
  );

  const freeTables = useMemo(() => tables.filter((tbl) => tbl.status === 'free'), [tables]);

  /* -------------------------------------------------------------- Render */

  return (
    <PageTransition>
      <PageHeader
        icon={<TableOutlined />}
        title={t('tables.title')}
        subtitle={t('tables.subtitle')}
        extra={
          <>
            {canManage && (
              <Button icon={<SettingOutlined />} onClick={() => openManage(false)}>
                {t('tables.manage')}
              </Button>
            )}
            <Tooltip title={t('btn.refresh')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void fetchTables()}
                aria-label={t('btn.refresh')}
              />
            </Tooltip>
          </>
        }
        stats={
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statBusy')}
                value={`${busyCount} / ${tables.length}`}
                icon={<FireOutlined />}
                accent={TOKENS.color.neonGreen}
                loading={loading && tables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statFree')}
                value={freeCount}
                icon={<CheckCircleOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={loading && tables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statOccupancy')}
                value={`${occupancy}%`}
                icon={<PieChartOutlined />}
                loading={loading && tables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statTodayGames')}
                value={todayGames}
                icon={<HistoryOutlined />}
                accent={TOKENS.color.semantic.info}
                loading={loading && tables.length === 0}
              />
            </Col>
          </Row>
        }
      />

      {loading && tables.length === 0 ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={i}>
              <Card loading style={{ minHeight: 180 }} />
            </Col>
          ))}
        </Row>
      ) : loadError && tables.length === 0 ? (
        <EmptyState
          icon={<WarningOutlined />}
          title={t('tables.loadError')}
          hint={t('tables.loadErrorHint')}
          action={
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void fetchTables()}>
              {t('tables.retry')}
            </Button>
          }
        />
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<TableOutlined />}
          title={t('tables.noTables')}
          hint={canManage ? t('tables.noTablesHint') : t('tables.noTablesOperatorHint')}
          action={
            canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openManage(true)}>
                {t('tables.addFirstTable')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          {tables.map((table) => {
            const session = table.sessions?.[0] ?? null;
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={table.id}>
                <TableCard
                  table={table}
                  session={session}
                  segments={session ? (segmentsMap[session.id] ?? null) : null}
                  offsetMs={offsetMs}
                  pending={!!session && pendingIds.has(session.id)}
                  canCheckout={canCheckout}
                  onStart={openStart}
                  onOrder={openOrder}
                  onTransfer={openTransfer}
                  onCheckout={openCheckout}
                  onPauseResume={handlePauseResume}
                  onCancel={handleCancel}
                />
              </Col>
            );
          })}
        </Row>
      )}

      {/* O'yin boshlash */}
      <StartModal table={startTable} onClose={() => setStartTable(null)} onStarted={handleStarted} />

      {/* Bar buyurtmasi */}
      <OrderModal table={orderTable} onClose={() => setOrderTable(null)} onOrdered={silentRefresh} />

      {/* Boshqa stolga ko'chirish */}
      <TransferModal
        table={transferTable}
        freeTables={freeTables}
        onClose={() => setTransferTable(null)}
        onTransferred={handleTransferred}
      />

      {/* Hisob-kitob (checkout drawer) */}
      <CheckoutDrawer
        table={checkoutTable}
        isAdmin={canManage}
        clubName={club?.name ?? ''}
        onClose={() => setCheckoutTable(null)}
        onSessionMutated={silentRefresh}
        onSettled={silentRefresh}
      />

      {/* Stollarni boshqarish (admin CRUD) */}
      <ManageTablesDrawer
        open={manageOpen}
        startWithCreate={manageStartCreate}
        tables={tables}
        onClose={() => setManageOpen(false)}
        onChanged={silentRefresh}
      />
    </PageTransition>
  );
};

export default TablesPage;
