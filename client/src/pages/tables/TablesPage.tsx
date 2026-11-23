import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Input, Segmented, Select, Tooltip } from 'antd';
import {
  BulbOutlined,
  AppstoreOutlined,
  BarsOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { errorMessage, isNetworkError, lightsApi, reservationsApi, sessionsApi, tablesApi } from '../../api';
import { EmptyState, PageHeader, PageTransition } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { applyQueueToTables, hasPendingOps, withOfflineTransfers } from '../../offline/overlay';
import { loadCustomerDirectory } from '../../offline/customer-directory';
import { desktopLights, type LightHubStatus } from '../../offline/desktop';
import { buildLightHubView, hubControlling, withHubLightState } from '../../offline/light-hub';
import {
  newActionKey, queueCancelSession, queuePauseResume, queuePlanChange,
} from '../../offline/pos';
import type {
  BilliardTable, Reservation, Session, SessionPlanPayload, TableLightConfig,
} from '../../types';
import { formatClock } from '../../utils/format';
import {
  clockOffsetMs,
  initialSegmentOf,
  segmentsMatchSession,
  type SegmentLike,
} from '../../utils/session';
import BoardMoneyStrip from './BoardMoneyStrip';
import CheckoutDrawer from './CheckoutDrawer';
import LightSettingsDrawer from './LightSettingsDrawer';
import LimitModal from './LimitModal';
import ManageTablesDrawer from './ManageTablesDrawer';
import OrderModal from './OrderModal';
import StartModal from './StartModal';
import TableCard from './TableCard';
import { useEntitlements } from '../../hooks/useEntitlements';
import TransferModal from './TransferModal';
import { parseTableView, selectBoardTables, tableMatchesView, type TableSort, type TableView } from './table-board';
import '../../styles/tables-workspace.css';

/** Stollar ro'yxatini jimgina yangilash davri (ms) */
const POLL_INTERVAL_MS = 15_000;

type BoardDensity = 'comfortable' | 'compact';

/** Ko'rinish tanlovi qurilmada eslab qolinadi (kassir har safar qayta tanlamasin) */
const DENSITY_KEY = 'tables.density';

/**
 * Boshlang'ich ko'rinish: saqlangan tanlov, bo'lmasa telefonda ixcham
 * ro'yxat (butun zal bitta ekranga sig'adi), kattaroq ekranda kartalar.
 */
const initialDensity = (): BoardDensity => {
  try {
    const saved = localStorage.getItem(DENSITY_KEY);
    if (saved === 'comfortable' || saved === 'compact') return saved;
  } catch {
    /* xotira yopiq — standart qoidaga tushamiz */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches
    ? 'compact'
    : 'comfortable';
};

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
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const { hasRole, club } = useAuth();
  const { online, entries, pending } = useConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedView = parseTableView(searchParams.get('view'));
  const focusedTableId = Number(searchParams.get('table')) || null;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TableSort>('number');
  const [density, setDensityState] = useState<BoardDensity>(initialDensity);
  const setDensity = (value: BoardDensity) => {
    setDensityState(value);
    try {
      localStorage.setItem(DENSITY_KEY, value);
    } catch {
      /* xotira yopiq (private rejim) — tanlov faqat shu sahifada qoladi */
    }
  };
  const changeView = (view: TableView) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    if (view === 'all') next.delete('view');
    else next.set('view', view);
    return next;
  }, { replace: true });

  const currency = useCurrency();
  /** Hisob-kitob (o'yinni yakunlash): admin, kassir va operator — server ham shunday */
  const canCheckout = hasRole('admin', 'kassir', 'operator', 'superadmin');
  /** Kassa smenasi va o'yinni bekor qilish — faqat admin va kassir (serverda operatorga yopiq) */
  const canCashDesk = hasRole('admin', 'kassir', 'superadmin');
  const canManage = hasRole('admin', 'superadmin');
  // Tarif (Standart / Pro / VIP): yo'q imkoniyat so'ralmaydi va tugmasi ko'rinmaydi
  const { can } = useEntitlements();
  const canBar = can('bar');
  const canLights = can('lights');
  /**
   * Chiroqni qo'lda yoqish/o'chirish va «Chiroq boshqaruvi» — admin va kassir.
   * Operator chiroqqa tegmaydi: chiroq o'yin bilan avtomatik yonadi/o'chadi, kartada
   * esa faqat holat belgisi ko'rinadi (server ham operatorga chiroq API larini yopgan).
   */
  const canLightControl = canLights && hasRole('admin', 'kassir', 'superadmin');
  const canReservations = can('reservations');
  const canShifts = can('shifts');
  // Internetsiz qarz «Mijozlar» ro'yxatidagi mijozga yoziladi — ikkala imkoniyat kerak
  const canOfflineDebt = canCheckout && can('debts') && can('customers');

  /**
   * Navbat va ekrandagi stollar — callbacklar ichida ref orqali o'qiladi:
   * ular har poll/navbat o'zgarishida qayta yaratilmasin (TableCard memo).
   */
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const viewTablesRef = useRef<BilliardTable[]>([]);

  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  /**
   * Stollar serverdan OXIRGI MARTA haqiqatan olingan vaqt (server soati, ms).
   * Keshdan ko'rsatilganda — keshning asl vaqti (hozirgi vaqt EMAS): chiroq
   * markazi eski ma'lumotni yangi deb qabul qilib, chiroqni o'chirib qo'ymasin.
   */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  /** Kompyuterdagi chiroq markazi holati (faqat desktop dasturda) */
  const [hubStatus, setHubStatus] = useState<LightHubStatus | null>(null);
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
  // Summa limiti oynasi SESSIYAGA bog'lanadi (stolga emas): stol va sessiya har
  // renderda yangi ro'yxatdan olinadi — oyna ochiq turganda holat eskirmaydi,
  // boshqa terminal o'yinni ko'chirsa oyna sessiya ortidan boradi, yakunlasa
  // yopiladi. Stol ID si saqlansa, o'sha stolda keyin boshlangan YANGI o'yin
  // uchun oyna o'z-o'zidan qayta ochilib ketardi.
  const [limitSessionId, setLimitSessionId] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageStartCreate, setManageStartCreate] = useState(false);
  const lightsOpen = searchParams.get('panel') === 'lights';
  const setLightsOpen = (open: boolean) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    if (open) next.set('panel', 'lights');
    else next.delete('panel');
    return next;
  }, { replace: true });
  const lightRequests = useRef(new Set<number>());
  const [pendingLights, setPendingLights] = useState<ReadonlySet<number>>(new Set());

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
        setFetchedAt(res.fromCache
          ? (typeof res.cachedAt === 'number' ? res.cachedAt : null)
          : (Number.isNaN(serverMs) ? Date.now() : serverMs));
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

  // Poller FAQAT tab ko'rinib turganda ishlaydi (NotificationsContext bilan bir
  // xil naqsh): fon rejimidagi/uxlab qolgan planshet serverni bekorga bosmaydi
  // va batareyani yemaydi. Tabga qaytilganda darhol bir marta yangilanadi.
  useEffect(() => {
    void fetchTables();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchTables(true);
    };
    const poll = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchTables(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
   * MIJOZLAR KATALOGINI OLDINDAN KESHLASH — internet uzilganda qarzni ro'yxatdagi
   * mijozga yozish uchun (offline/customer-directory.ts). Sahifa onlayn
   * ochilganda va har gal aloqa tiklanganda yangilanadi; xato jim — bu faqat
   * oflayn zaxira, asosiy ishga to'sqinlik qilmaydi.
   */
  useEffect(() => {
    if (!online || !canOfflineDebt) return;
    void loadCustomerDirectory().catch(() => undefined);
  }, [online, canOfflineDebt]);

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
       * NAVBATGA uch holatda tushadi:
       *  1. internet yo'q;
       *  2. sessiyaning O'ZI hali serverda YO'Q (oflayn boshlangan) — uning
       *     `id` si manfiy sintetik qiymat, uni serverga yuborish 404 berardi.
       *     Aloqa tiklangan bo'lsa ham bu amal sessiya yaratilgandan KEYIN
       *     yuborilishi kerak, shuning uchun navbatdagi tartibga qo'shiladi
       *     ($local havolasi orqali — offline/queue.ts);
       *  3. shu o'yin/stol bo'yicha navbatda yuborilmagan amal bor — tartib
       *     buzilmasin (offline/overlay.ts: hasPendingOps).
       */
      const pendingOps = hasPendingOps(entriesRef.current, session, [table.id]);
      if (!online || session.offlineLocalId || pendingOps) {
        try {
          await queuePauseResume(table, session, resume, key, offsetMs);
          message.success(t(online && pendingOps ? 'offline.savedQueued' : 'offline.savedOffline'));
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
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

  /**
   * O'yin vaqti cheklovini o'zgartirish: belgilangan vaqtni uzaytirish, summa
   * limitini qo'yish/oshirish yoki cheklovni olib tashlash. Internetsiz ham
   * ishlaydi — navbatga yoziladi va kartada darhol ko'rinadi (overlay).
   * @returns muvaffaqiyatli saqlandimi (limit oynasi shunga qarab yopiladi)
   */
  const handlePlanChange = useCallback(
    async (session: Session, plan: SessionPlanPayload): Promise<boolean> => {
      const key = newActionKey();
      // Sessiya hozir turgan stol (oflayn ko'chirilgan bo'lsa — yangisi)
      const table = viewTablesRef.current.find((tbl) => tbl.id === session.tableId) ?? null;
      const queue = async (afterPending: boolean): Promise<boolean> => {
        if (!table) {
          message.error(t('common.error'));
          return false;
        }
        try {
          await queuePlanChange(table, session, plan, key, offsetMs);
          message.success(t(afterPending ? 'offline.savedQueued' : 'offline.savedOffline'));
          return true;
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
          return false;
        }
      };
      const pendingOps = hasPendingOps(entriesRef.current, session, [session.tableId]);
      if (!online || session.offlineLocalId || pendingOps) return queue(online && pendingOps);

      markPending(session.id, true);
      try {
        const res = await sessionsApi.updatePlan(session.id, plan, key);
        message.success(res.message);
        await fetchTables(true);
        return true;
      } catch (err) {
        // Aloqa aynan shu so'rovda uzildi — o'zgarish yo'qolmasin, navbatga tushsin
        if (isNetworkError(err)) return queue(false);
        message.error(errorMessage(err, t('common.error')));
        return false;
      } finally {
        markPending(session.id, false);
      }
    },
    [fetchTables, markPending, message, offsetMs, online, t],
  );

  const handleLimitSubmit = useCallback(
    (session: Session, limitAmount: number) => handlePlanChange(session, { limitAmount }),
    [handlePlanChange],
  );

  /**
   * O'yinni bekor qilish. Internetsiz ham ishlaydi: o'yin AYNAN bosilgan
   * paytda to'xtagan hisoblanadi (offline/pos.ts: queueCancelSession), stol
   * darhol bo'shaydi. Kassir chegarasi (barsiz va 10 daqiqagacha) kartada
   * tekshiriladi va server uni o'sha payt bo'yicha qayta tekshiradi — rad
   * etsa amal navbatda "xato" bo'lib ko'rinadi va stol yana band bo'ladi.
   */
  const handleCancel = useCallback(
    async (session: Session, table: BilliardTable) => {
      const key = newActionKey();
      const queue = async (afterPending: boolean) => {
        try {
          await queueCancelSession(table, session, key, offsetMs);
          message.success(t(afterPending ? 'offline.savedQueued' : 'offline.savedOffline'));
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
      };
      const pendingOps = hasPendingOps(entriesRef.current, session, [table.id]);
      if (!online || session.offlineLocalId || pendingOps) {
        await queue(online && pendingOps);
        return;
      }
      markPending(session.id, true);
      try {
        const res = await sessionsApi.cancel(session.id, key);
        message.success(res.message);
        await fetchTables(true);
      } catch (err) {
        // Aloqa aynan shu so'rovda uzildi — bekor qilish bosilgan payt bilan navbatga
        if (isNetworkError(err)) {
          await queue(false);
          return;
        }
        message.error(errorMessage(err, t('common.error')));
      } finally {
        markPending(session.id, false);
      }
    },
    [fetchTables, markPending, message, offsetMs, online, t],
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
  const openLimit = useCallback(
    (table: BilliardTable) => setLimitSessionId(table.sessions?.[0]?.id ?? null),
    [],
  );
  const closeLimit = useCallback(() => setLimitSessionId(null), []);

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

  /** Markaz shu kompyuterda ishlayapti va relelarni boshqaryapti */
  const hubActive = hubControlling(hubStatus);

  /**
   * Internetsiz qo'lda boshqaruv: buyruq to'g'ridan-to'g'ri kompyuterdagi chiroq
   * markaziga ketadi (serverga emas). `true` — markaz bajardi.
   */
  const lightViaHub = useCallback(async (tableIds: number[] | null, on: boolean | null): Promise<boolean> => {
    const hub = desktopLights();
    if (!hub || !hubActive) return false;
    await hub.override({ tableIds, on, minutes: 30 });
    message.success(t('tables.lightsLocalApplied'));
    return true;
  }, [hubActive, message, t]);

  /**
   * Chiroqni qo'lda yoqish/o'chirish (override, 30 daqiqa).
   * Butunlay QO'SHIMCHA amal — sessiya oqimiga hech qanday aloqasi yo'q.
   * Internet bo'lmasa (va desktop dasturda chiroq markazi yoqilgan bo'lsa)
   * buyruq shu kompyuterdan to'g'ridan-to'g'ri bajariladi.
   */
  const handleLightToggle = useCallback(
    async (table: BilliardTable, on: boolean) => {
      if (lightRequests.current.has(table.id)) return;
      if (!online) {
        try {
          if (!(await lightViaHub([table.id], on))) message.warning(t('offline.offlineBlocked'));
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
        return;
      }
      lightRequests.current.add(table.id);
      setPendingLights(new Set(lightRequests.current));
      try {
        const res = await lightsApi.override(table.id, on);
        message.info(i18n.language.startsWith('ru') ? 'Команда принята. Ожидайте ответ реле.' : 'Buyruq qabul qilindi. Rele javobini kuting.');
        applyLightResult(table.id, res.data);
        await fetchTables(true);
        // Bridge rejimida haqiqiy holat bir necha soniyadan keyin keladi
        scheduleLightRefresh();
      } catch (err) {
        // Aloqa aynan shu so'rovda uzildi — buyruqni kompyuterdagi markaz bajaradi
        if (isNetworkError(err) && await lightViaHub([table.id], on).catch(() => false)) return;
        message.error(errorMessage(err, t('common.error')));
      } finally {
        lightRequests.current.delete(table.id);
        setPendingLights(new Set(lightRequests.current));
      }
    },
    [applyLightResult, fetchTables, message, scheduleLightRefresh, t, online, i18n, lightViaHub],
  );

  /** Qo'lda boshqaruvni bekor qilish — chiroq avtomatik (sessiya) holatiga qaytadi */
  const handleLightAuto = useCallback(
    async (table: BilliardTable) => {
      if (lightRequests.current.has(table.id)) return;
      if (!online) {
        try {
          if (!(await lightViaHub([table.id], null))) message.warning(t('offline.offlineBlocked'));
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
        return;
      }
      lightRequests.current.add(table.id);
      setPendingLights(new Set(lightRequests.current));
      try {
        const res = await lightsApi.override(table.id, null);
        message.success(res.message);
        applyLightResult(table.id, res.data);
        await fetchTables(true);
        scheduleLightRefresh();
      } catch (err) {
        if (isNetworkError(err) && await lightViaHub([table.id], null).catch(() => false)) return;
        message.error(errorMessage(err, t('common.error')));
      } finally {
        lightRequests.current.delete(table.id);
        setPendingLights(new Set(lightRequests.current));
      }
    },
    [applyLightResult, fetchTables, message, scheduleLightRefresh, t, online, lightViaHub],
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
  viewTablesRef.current = viewTables;

  /**
   * EKRANDAGI segmentlar = server keshi + navbatdagi oflayn ko'chirishlar.
   * Oflayn ko'chirilgan o'yinning jonli summasi, limiti va oflayn cheki eski
   * stol narxida shu paytgacha, yangisida shu paytdan hisoblanadi — server
   * navbatni qabul qilganda yozadigan bo'linish bilan aynan bir xil
   * (offline/overlay.ts: withOfflineTransfers).
   */
  const viewSegments = useMemo(() => {
    let changed = false;
    const map: Record<number, SegmentLike[]> = { ...segmentsMap };
    for (const tbl of viewTables) {
      const session = tbl.sessions?.[0];
      if (!session?.offlineTransfers?.length) continue;
      const segments = withOfflineTransfers(session, segmentsMap[session.id] ?? null);
      if (segments) {
        map[session.id] = segments;
        changed = true;
      }
    }
    return changed ? map : segmentsMap;
  }, [viewTables, segmentsMap]);

  /* ------------------------------------------------ Chiroq markazi (desktop) */

  // Markaz holatiga obuna: kartadagi chiroq tugmasi relening JONLI holatini
  // ko'rsatadi va internetsiz ham ishlaydi
  useEffect(() => {
    const hub = desktopLights();
    if (!hub) return undefined;
    let alive = true;
    hub.status().then((status) => { if (alive) setHubStatus(status); }).catch(() => undefined);
    const unsubscribe = hub.onStatus((status) => { if (alive) setHubStatus(status); });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Kassir ko'rib turgan holat (navbatdagi amallar bilan) markazga uzatiladi:
  // internet uzilsa ham chiroq o'yin bilan birga yonadi/o'chadi
  const hubRunning = Boolean(hubStatus?.running);
  useEffect(() => {
    const hub = desktopLights();
    if (!hub || !hubRunning) return;
    const fetchedServerMs = fetchedAt === null ? null : fetchedAt;
    hub.pushView(buildLightHubView(viewTables, entries, fetchedServerMs, Date.now() + offsetMs));
  }, [viewTables, entries, fetchedAt, offsetMs, hubRunning]);

  /** Kartalar uchun: markazning jonli chiroq holati qo'shilgan stollar */
  const hubLightTables = useMemo(() => {
    const merged = withHubLightState(viewTables, hubStatus, Date.now() + offsetMs);
    return new Map(merged.map((table) => [table.id, table]));
  }, [viewTables, hubStatus, offsetMs]);

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
  const displayedTables = useMemo(
    () => selectBoardTables(viewTables, selectedView, search, sort),
    [viewTables, selectedView, search, sort],
  );
  const focusedTableVisible = displayedTables.some((table) => table.id === focusedTableId);
  // Limit oynasidagi stol — sessiya hozir turgan stol (yakunlangan bo'lsa null: oyna yopiladi)
  const limitTable = useMemo(
    () => (limitSessionId === null
      ? null
      : viewTables.find((table) => table.sessions?.[0]?.id === limitSessionId) ?? null),
    [limitSessionId, viewTables],
  );
  useEffect(() => {
    if (!focusedTableId || !focusedTableVisible) return;
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`workspace-table-${focusedTableId}`);
      card?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      card?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedTableId, focusedTableVisible]);
  const views: TableView[] = ['all', 'free', 'busy', 'paused', 'attention'];

  /**
   * Zonalar: kamida bitta stolda zona bo'lsa panel zallar bo'yicha guruhlanadi
   * (tartib — stollar tartibidagi birinchi uchrashuv). Zonasiz stollar
   * "Boshqa stollar" guruhiga tushadi.
   */
  const zoneGroups = useMemo(() => {
    if (!displayedTables.some((table) => table.zone?.trim())) return null;
    const groups = new Map<string, BilliardTable[]>();
    for (const table of displayedTables) {
      const key = table.zone?.trim() ?? '';
      groups.set(key, [...(groups.get(key) ?? []), table]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => Number(a === '') - Number(b === ''))
      .map(([zone, list]) => ({ zone, list, busy: list.filter((table) => table.status === 'busy').length }));
  }, [displayedTables]);

  /** Yaqin bronlar (6 soat ichida) — har stol uchun eng yaqini kartada ko'rinadi */
  const [reservations, setReservations] = useState<Reservation[]>([]);
  useEffect(() => {
    if (!online || !canReservations) return;
    let alive = true;
    const load = () => {
      const from = new Date(Date.now() - 30 * 60_000);
      const to = new Date(Date.now() + 6 * 3600_000);
      reservationsApi
        .list({ from: from.toISOString(), to: to.toISOString(), limit: 100 })
        .then((res) => {
          if (alive) setReservations(res.data ?? []);
        })
        .catch(() => {
          /* bron belgisi ikkilamchi — xatoda jim */
        });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [online, canReservations]);
  const reservationByTable = useMemo(() => {
    const map = new Map<number, string>();
    const upcoming = reservations
      .filter((r) => r.status === 'pending' || r.status === 'confirmed')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    for (const r of upcoming) {
      if (map.has(r.tableId)) continue;
      const name = r.customerName || r.customer?.name;
      map.set(r.tableId, `${t('tables.reservationChip', { time: formatClock(r.startsAt) })}${name ? ` · ${name}` : ''}`);
    }
    return map;
  }, [reservations, t]);

  const renderTable = (listed: BilliardTable) => {
    const table = hubLightTables.get(listed.id) ?? listed;
    const session = table.sessions?.[0] ?? null;
    return (
      <TableCard
        key={table.id}
        variant={density === 'compact' ? 'row' : 'card'}
        table={table}
        lightLocal={hubActive}
        focused={table.id === focusedTableId}
        session={session}
        segments={session ? (viewSegments[session.id] ?? null) : null}
        offsetMs={offsetMs}
        online={online}
        pending={!!session && pendingIds.has(session.id)}
        lightPending={pendingLights.has(table.id)}
        canCheckout={canCheckout}
        canCancelGames={canCashDesk}
        canManage={canManage}
        reservation={reservationByTable.get(table.id)}
        onStart={openStart}
        onOrder={canBar ? openOrder : undefined}
        onTransfer={openTransfer}
        onCheckout={openCheckout}
        onPauseResume={handlePauseResume}
        onCancel={handleCancel}
        onLightToggle={canLightControl ? handleLightToggle : undefined}
        onLightAuto={canLightControl ? handleLightAuto : undefined}
        lightReadOnly={canLights && !canLightControl}
        onPlanChange={handlePlanChange}
        onLimitEdit={openLimit}
      />
    );
  };

  /* -------------------------------------------------------------- Render */

  return (
    <PageTransition>
      <section className="tables-workspace">
      <PageHeader
        icon={<TableOutlined />}
        title={t('tables.title')}
        subtitle={t('tables.subtitle')}
        extra={
          <>
            {canManage && (
              <Button icon={<SettingOutlined />} aria-label={t('tables.manage')} onClick={() => openManage(false)}>
                {t('tables.manage')}
              </Button>
            )}
            {/* Chiroq boshqaruvi — ixtiyoriy imkoniyat. Kassirga ham ochiq (ko'rish,
                qo'lda boshqarish, master, jurnal; sozlashni ichkarida `canEdit`
                bloklaydi). Operatorga ko'rinmaydi */}
            {canLightControl && (
              <Tooltip title={t('tables.lightsTitle')}>
                <Button
                  icon={<BulbOutlined />}
                  onClick={() => setLightsOpen(true)}
                  aria-label={t('tables.lightsTitle')}
                >{t('tables.lightsTitle')}</Button>
              </Tooltip>
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
      />

      {viewTables.length > 0 && (
        <BoardMoneyStrip
          tables={viewTables}
          segmentsMap={viewSegments}
          offsetMs={offsetMs}
          currency={currency}
          showShift={canCashDesk && canShifts}
          online={online}
        />
      )}

      <div className="tables-overview" aria-label={t('tables.boardSummary')}>
        <div className="tables-overview__occupancy">
          <span className="tables-overview__label">{t('tables.statOccupancy')}</span>
          <div className="tables-overview__value">{occupancy}<span>%</span></div>
          <div className="tables-occupancy-track" role="meter" aria-label={t('tables.statOccupancy')} aria-valuenow={occupancy} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${occupancy}%` }} />
          </div>
        </div>
        <button className="tables-overview__metric" onClick={() => changeView('busy')}>
          <span className="tables-overview__label"><i className="tables-state-dot is-busy" />{t('tables.statBusy')}</span>
          <strong>{busyCount}<small> / {viewTables.length}</small></strong>
        </button>
        <button className="tables-overview__metric" onClick={() => changeView('free')}>
          <span className="tables-overview__label"><i className="tables-state-dot is-free" />{t('tables.statFree')}</span>
          <strong>{freeCount}</strong>
        </button>
        <div className="tables-overview__metric">
          <span className="tables-overview__label"><HistoryOutlined />{t('tables.statTodayGames')}</span>
          <strong>{todayGames}</strong>
        </div>
      </div>

      {loadError && viewTables.length > 0 && <Alert className="tables-load-warning" type="warning" showIcon message={t('tables.staleData')} />}

      {viewTables.length > 0 && (
        <div className="tables-board-controls">
          <div className="tables-board-toolbar">
            <Input className="tables-board-search" prefix={<SearchOutlined />} allowClear value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder={t('tables.searchTables')}
              aria-label={t('tables.searchTables')} />
            <Select className="tables-board-sort" value={sort} onChange={setSort} aria-label={t('tables.sortLabel')}
              options={[{ value: 'number', label: t('tables.sortNumber') }, { value: 'busy', label: t('tables.sortBusy') }]} />
            <Segmented<BoardDensity> className="tables-board-density" value={density} onChange={setDensity} aria-label={t('tables.densityLabel')}
              options={[{ value: 'comfortable', label: <AppstoreOutlined aria-label={t('tables.densityComfortable')} /> },
                { value: 'compact', label: <BarsOutlined aria-label={t('tables.densityCompact')} /> }]} />
          </div>
          <div className="tables-board-filter-row">
            <div className="tables-board-filters" role="group" aria-label={t('tables.filterLabel')}>
              {views.map((view) => <button key={view} className={`tables-filter${selectedView === view ? ' is-selected' : ''}`}
                aria-pressed={selectedView === view} onClick={() => changeView(view)}>
                {t(`tables.view_${view}`)}<span>{viewTables.filter((table) => tableMatchesView(table, view)).length}</span>
              </button>)}
            </div>
            <span className="tables-result-count" aria-live="polite">{t('tables.showingTables', { shown: displayedTables.length, total: viewTables.length })}</span>
          </div>
          {selectedView === 'attention' && <p className="tables-filter-hint">{t('tables.attentionHint')}</p>}
        </div>
      )}

      {loading && viewTables.length === 0 ? (
        <div className="tables-board-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} loading style={{ minHeight: 260 }} />
          ))}
        </div>
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
      ) : displayedTables.length === 0 ? (
        <EmptyState icon={<SearchOutlined />} title={t('tables.noMatchingTables')} hint={t('tables.noMatchingHint')}
          action={<Button onClick={() => { setSearch(''); changeView('all'); }}>{t('tables.clearFilters')}</Button>} />
      ) : zoneGroups ? (
        /* Zonalar bo'yicha: har zal o'z sarlavhasi va band/bo'sh soni bilan */
        zoneGroups.map((group) => (
          <section key={group.zone || '__none'} className="tables-zone" aria-label={group.zone || t('tables.zoneOther')}>
            <header className="tables-zone__head">
              <h3>{group.zone || t('tables.zoneOther')}</h3>
              <span>{t('tables.zoneCounts', { busy: group.busy, free: group.list.length - group.busy })}</span>
            </header>
            <div className={`tables-board-grid tables-board-grid--${density}`}>
              {group.list.map(renderTable)}
            </div>
          </section>
        ))
      ) : (
        <div className={`tables-board-grid tables-board-grid--${density}`}>
          {displayedTables.map(renderTable)}
        </div>
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

      {/* Summa limiti — o'yin davomida qo'yish yoki oshirish ("yana 20 mingga") */}
      <LimitModal
        table={limitTable}
        segments={limitTable?.sessions?.[0] ? (viewSegments[limitTable.sessions[0].id] ?? null) : null}
        offsetMs={offsetMs}
        onSubmit={handleLimitSubmit}
        onClose={closeLimit}
      />

      {/* Bar buyurtmasi (oflaynda haqiqiy vaqti bilan navbatga) */}
      <OrderModal table={orderTable} onClose={() => setOrderTable(null)} onOrdered={silentRefresh} offsetMs={offsetMs} />

      {/* Boshqa stolga ko'chirish (oflaynda navbatga — overlay o'yinni darhol ko'chiradi) */}
      <TransferModal
        table={transferTable}
        freeTables={freeTables}
        onClose={() => setTransferTable(null)}
        onTransferred={handleTransferred}
        onQueuedOffline={silentRefresh}
        offsetMs={offsetMs}
      />

      {/* Hisob-kitob (checkout drawer) */}
      <CheckoutDrawer
        table={checkoutTable}
        isAdmin={canManage}
        clubName={club?.name ?? ''}
        onClose={() => setCheckoutTable(null)}
        onSettled={silentRefresh}
        segments={checkoutTable?.sessions?.[0] ? (viewSegments[checkoutTable.sessions[0].id] ?? null) : null}
        offsetMs={offsetMs}
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
      {canLightControl && (
        <LightSettingsDrawer
          open={lightsOpen}
          onClose={() => setLightsOpen(false)}
          onChanged={silentRefresh}
        />
      )}
      </section>
    </PageTransition>
  );
};

export default TablesPage;
