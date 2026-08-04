import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Col, Row, Tooltip } from 'antd';
import {
  BulbOutlined,
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
import { errorMessage, isNetworkError, lightsApi, sessionsApi, tablesApi } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { applyQueueToTables } from '../../offline/overlay';
import { newActionKey, queuePauseResume } from '../../offline/pos';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session, TableLightConfig } from '../../types';
import {
  clockOffsetMs,
  initialSegmentOf,
  segmentsMatchSession,
  type SegmentLike,
} from '../../utils/session';
import CheckoutDrawer from './CheckoutDrawer';
import LightSettingsDrawer from './LightSettingsDrawer';
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
  const { online, entries, pending } = useConnection();

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

  /**
   * POYGA HIMOYASI (sekin tarmoqda kritik).
   *
   * 15 soniyalik poll oldingi so'rov tugashini kutmaydi, shuning uchun sekin
   * tarmoqda so'rovlar ustma-ust chiqadi va javoblar TARTIBSIZ keladi. Himoyasiz
   * holatda ESKI javob yangisining ustiga yozilardi:
   *  - yakunlangan sessiya ekranda yana "band" bo'lib ko'rinardi;
   *  - eng yomoni, eskirgan `serverNow` bilan `offsetMs` ORQAGA siljib,
   *    kartadagi taymer va JONLI SUMMA orqaga sakrardi — kassir uchun
   *    bevosita chalg'ituvchi va pul bilan bog'liq.
   * Yechim: monoton ketma-ketlik raqami + `serverNow` faqat oldinga siljiydi.
   */
  const reqSeqRef = useRef(0);
  const lastServerNowRef = useRef(0);

  const [startTable, setStartTable] = useState<BilliardTable | null>(null);
  const [orderTable, setOrderTable] = useState<BilliardTable | null>(null);
  const [transferTable, setTransferTable] = useState<BilliardTable | null>(null);
  const [checkoutTable, setCheckoutTable] = useState<BilliardTable | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageStartCreate, setManageStartCreate] = useState(false);
  const [lightsOpen, setLightsOpen] = useState(false);

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
      const seq = ++reqSeqRef.current;
      try {
        const res = await tablesApi.list();
        // Bu javob eskirganmi — undan keyin yangi so'rov ketgan bo'lsa tashlanadi
        if (seq !== reqSeqRef.current) return;
        setTables(res.data);
        // Soat siljishi FAQAT yangiroq server vaqti bilan yangilanadi:
        // eskirgan `serverNow` taymerni orqaga qaytarmasin
        const serverMs = res.serverNow ? Date.parse(res.serverNow) : NaN;
        if (!Number.isNaN(serverMs) && serverMs >= lastServerNowRef.current) {
          lastServerNowRef.current = serverMs;
          setOffsetMs(clockOffsetMs(res.serverNow));
        }
        setLoadError(false);
        void syncSegments(res.data);
      } catch (err) {
        if (seq !== reqSeqRef.current) return;
        setLoadError(true);
        if (!silent) message.error(errorMessage(err, t('common.error')));
      } finally {
        // Spinner HAR DOIM o'chiriladi (seq tekshiruvisiz): u ma'lumot
        // tartibiga emas, foydalanuvchi bosgan amalga tegishli — aks holda
        // qo'lda yangilash poll bilan ustma-ust tushganda spinner qotib qolardi
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

  /**
   * Navbat bo'shashi bilan serverdan darhol yangilaymiz.
   *
   * Aks holda qisqa "titrash" bo'lardi: amal yuborilgach navbatdan chiqadi va
   * qoplama yo'qoladi, serverdan kelgan haqiqiy holat esa keyingi poll'gacha
   * (15 soniya) kelmaydi — shu oraliqda band stol "bo'sh" bo'lib ko'rinardi.
   */
  const prevPendingRef = useRef(pending);
  useEffect(() => {
    if (pending < prevPendingRef.current) void fetchTables(true);
    prevPendingRef.current = pending;
  }, [pending, fetchTables]);

  /**
   * Chiroq holati amaldan keyin bir necha yuz millisekundda o'zgaradi (bridge
   * rejimida agent buyruqni olib qo'llaguncha), poll esa 15 s da bir keladi —
   * shuning uchun amaldan ~2 soniya keyin BITTA qo'shimcha yangilash
   * rejalashtiriladi (unmount da taymer tozalanadi).
   */
  const lightRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLightRefresh = useCallback(() => {
    if (lightRefreshTimer.current) clearTimeout(lightRefreshTimer.current);
    lightRefreshTimer.current = setTimeout(() => void fetchTables(true), 2000);
  }, [fetchTables]);

  useEffect(
    () => () => {
      if (lightRefreshTimer.current) clearTimeout(lightRefreshTimer.current);
    },
    [],
  );

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
    async (session: Session, table: BilliardTable) => {
      const resume = session.status === 'paused';

      // Bir martalik kalit: onlayn urinish ham, navbatdagi takror ham AYNAN
      // shuni ishlatadi — "server bajardi, javob yo'qoldi" holatida amal ikki
      // marta yozilmaydi (offline/pos.ts va api/index.ts izohlariga qarang)
      const key = newActionKey();

      /**
       * NAVBATGA ikki holatda tushadi:
       *  1. internet yo'q;
       *  2. sessiyaning O'ZI hali serverda YO'Q (oflayn boshlangan) — uning
       *     `id` si manfiy sintetik qiymat, uni serverga yuborish 404 berardi.
       *     Aloqa tiklangan bo'lsa ham bu amal sessiya yaratilgandan KEYIN
       *     yuborilishi kerak, shuning uchun navbatdagi tartibga qo'shiladi
       *     ($local havolasi orqali — offline/queue.ts).
       */
      if (!online || session.offlineLocalId) {
        try {
          await queuePauseResume(table, session, resume, key, offsetMs);
          message.success(t('offline.savedOffline'));
        } catch {
          message.error(t('common.error'));
        }
        return;
      }

      markPending(session.id, true);
      try {
        const res = resume
          ? await sessionsApi.resume(session.id, key)
          : await sessionsApi.pause(session.id, key);
        message.success(res.message);
        await fetchTables(true);
      } catch (err) {
        // Aloqa aynan shu so'rovda uzildi (oflayn holat hali aniqlanmagan) —
        // amalni yo'qotmasdan navbatga o'tkazamiz
        if (isNetworkError(err)) {
          try {
            await queuePauseResume(table, session, resume, key, offsetMs);
            message.success(t('offline.savedOffline'));
            return;
          } catch {
            // navbatga ham yozib bo'lmadi — oddiy xato ko'rsatiladi
          }
        }
        message.error(errorMessage(err, t('common.error')));
      } finally {
        markPending(session.id, false);
      }
    },
    [fetchTables, markPending, message, offsetMs, online, t],
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
      // O'yin boshlanishi chiroqni yoqadi — holat kartada tez ko'rinsin
      scheduleLightRefresh();
    },
    [commitSegments, fetchTables, scheduleLightRefresh],
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

  /**
   * Override javobidan kartani DARHOL yangilash — foydalanuvchi natijani
   * keyingi poll'ni (15 s) kutmasdan ko'radi.
   */
  const applyLightResult = useCallback((tableId: number, row: TableLightConfig) => {
    setTables((prev) =>
      prev.map((tbl) =>
        tbl.id === tableId
          ? {
              ...tbl,
              lightOverrideOn: row.overrideOn,
              lightOverrideUntil: row.overrideUntil,
              lightState: row.state,
              lightSyncedAt: row.syncedAt,
              lightError: row.error,
            }
          : tbl,
      ),
    );
  }, []);

  /**
   * Chiroqni qo'lda yoqish/o'chirish (override, 30 daqiqa).
   * Butunlay QO'SHIMCHA amal — sessiya oqimiga hech qanday aloqasi yo'q.
   */
  const handleLightToggle = useCallback(
    async (table: BilliardTable, on: boolean) => {
      try {
        const res = await lightsApi.override(table.id, on);
        message.success(res.message);
        applyLightResult(table.id, res.data);
        await fetchTables(true);
        // Bridge rejimida haqiqiy holat bir necha soniyadan keyin keladi
        scheduleLightRefresh();
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      }
    },
    [applyLightResult, fetchTables, message, scheduleLightRefresh, t],
  );

  /** Qo'lda boshqaruvni bekor qilish — chiroq avtomatik (sessiya) holatiga qaytadi */
  const handleLightAuto = useCallback(
    async (table: BilliardTable) => {
      try {
        const res = await lightsApi.override(table.id, null);
        message.success(res.message);
        applyLightResult(table.id, res.data);
        await fetchTables(true);
        scheduleLightRefresh();
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      }
    },
    [applyLightResult, fetchTables, message, scheduleLightRefresh, t],
  );

  /* ---------------------------------------------------------- Statistika */

  /**
   * EKRANGA CHIQADIGAN ro'yxat = serverdan/keshdan kelgan holat + hali
   * yuborilmagan oflayn amallar qoplamasi. Shu tufayli internet yo'q paytda
   * boshlangan o'yin darhol ko'rinadi va kassir amalni takrorlamaydi
   * (offline/overlay.ts izohiga qarang).
   */
  const viewTables = useMemo(
    () => applyQueueToTables(tables, entries),
    [tables, entries],
  );

  const busyCount = useMemo(
    () => viewTables.filter((tbl) => tbl.status === 'busy').length,
    [viewTables],
  );
  const freeCount = viewTables.length - busyCount;
  const occupancy = viewTables.length > 0 ? Math.round((busyCount / viewTables.length) * 100) : 0;
  const todayGames = useMemo(
    () => viewTables.reduce((sum, tbl) => sum + (tbl.todayCompletedSessions ?? 0), 0),
    [viewTables],
  );

  const freeTables = useMemo(
    () => viewTables.filter((tbl) => tbl.status === 'free'),
    [viewTables],
  );

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
            {/* Chiroq boshqaruvi — ixtiyoriy imkoniyat. Kassir/operatorga ham
                ochiq: server ularga ko'rish, qo'lda boshqarish, master va
                jurnalni bergan; ichkarida `canEdit` sozlashni bloklaydi */}
            <Tooltip title={t('tables.lightsTitle')}>
              <Button
                icon={<BulbOutlined />}
                onClick={() => setLightsOpen(true)}
                aria-label={t('tables.lightsTitle')}
              />
            </Tooltip>
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
                value={`${busyCount} / ${viewTables.length}`}
                icon={<FireOutlined />}
                accent={TOKENS.color.neonGreen}
                loading={loading && viewTables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statFree')}
                value={freeCount}
                icon={<CheckCircleOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={loading && viewTables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statOccupancy')}
                value={`${occupancy}%`}
                icon={<PieChartOutlined />}
                loading={loading && viewTables.length === 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label={t('tables.statTodayGames')}
                value={todayGames}
                icon={<HistoryOutlined />}
                accent={TOKENS.color.semantic.info}
                loading={loading && viewTables.length === 0}
              />
            </Col>
          </Row>
        }
      />

      {loading && viewTables.length === 0 ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={i}>
              <Card loading style={{ minHeight: 180 }} />
            </Col>
          ))}
        </Row>
      ) : loadError && viewTables.length === 0 ? (
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
      ) : viewTables.length === 0 ? (
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
          {viewTables.map((table) => {
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
                  canManage={canManage}
                  onStart={openStart}
                  onOrder={openOrder}
                  onTransfer={openTransfer}
                  onCheckout={openCheckout}
                  onPauseResume={handlePauseResume}
                  onCancel={handleCancel}
                  onLightToggle={handleLightToggle}
                  onLightAuto={handleLightAuto}
                />
              </Col>
            );
          })}
        </Row>
      )}

      {/* O'yin boshlash */}
      <StartModal
        table={startTable}
        onClose={() => setStartTable(null)}
        onStarted={handleStarted}
        // Oflayn boshlangan o'yin ekranda navbat qoplamasidan chiqadi —
        // bu yerda faqat serverdan yangilashga urinib ko'ramiz
        onQueuedOffline={silentRefresh}
        offsetMs={offsetMs}
      />

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

      {/* Chiroq boshqaruvi (ixtiyoriy imkoniyat) — barcha xodimlarga ochiq,
          sozlash huquqi javobdagi `canEdit` bilan cheklanadi */}
      <LightSettingsDrawer
        open={lightsOpen}
        onClose={() => setLightsOpen(false)}
        onChanged={silentRefresh}
      />
    </PageTransition>
  );
};

export default TablesPage;
