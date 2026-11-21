import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  RightOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { customersApi, errorMessage, isNetworkError, reservationsApi, tablesApi } from '../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { customerMatches, loadCustomerDirectory } from '../offline/customer-directory';
import {
  applyReservationOps,
  countOps,
  depKeys,
  findReservationOverlaps,
  hasQueuedDeps,
  isLocalRef,
  newOpKey,
  offlineCustomerOptions,
  opNow,
  queueReservationCreate,
  queueReservationStatus,
  reservationRefOf,
  type ReservationNextStatus,
  type ReservationView,
} from '../offline/ops';
import { TOKENS } from '../theme/tokens';
import type { BilliardTable, Reservation, ReservationStatus } from '../types';
import { isFormValidationError } from '../utils/formErrors';
import { clubWallTimeToIso, inClubTime } from '../utils/club-time';
import '../styles/operations.css';

const { Text } = Typography;

/** Bron holati -> StatusTag palitra kaliti */
const STATUS_TAG_KEY: Record<ReservationStatus, string> = {
  pending: 'warning',
  confirmed: 'info',
  seated: 'active',
  cancelled: 'cancelled',
  no_show: 'error',
};

/** Davomiylik ko'rsatilmagan bronda serverdagi standart oyna (daqiqa) */
const DEFAULT_DURATION_MIN = 60;

/** Serverdagi eng katta sahifa hajmi (undan kattasi 100 ga qisqartiriladi) */
const PAGE_LIMIT = 100;
/** Kun ko'rinishi sahifalanmaydi — barchasi yig'iladi, lekin xavfsizlik chegarasi bilan */
const MAX_PAGES = 20;

/**
 * ID bo'yicha takrorlarni olib tashlaydi: sahifalar ketma-ket so'ralayotganda
 * orada yangi bron qo'shilsa, saralash siljib bitta yozuv ikki sahifaga tushishi
 * mumkin — bu holda React'da "duplicate key" va ikki marta ko'rinish chiqardi.
 */
const dedupeById = (rows: Reservation[]): Reservation[] => {
  const byId = new Map<number, Reservation>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()];
};

interface FetchParams {
  day: Dayjs;
  status: ReservationStatus | null;
}

interface ReservationFormValues {
  tableId: number;
  /** Son — ro'yxatdagi mijoz; `$local:` — internetsiz qo'shilgan, hali yuborilmagan mijoz */
  customerId?: number | string;
  customerName?: string;
  customerPhone?: string;
  startsAt: Dayjs;
  durationMinutes?: number;
  notes?: string;
}

interface OverlapAlert {
  text: string;
  overlaps: Reservation[];
}

const Reservations = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const { online, entries } = useConnection();
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const focusedReservation = Number(searchParams.get('reservation')) || null;
  const [timezone, setTimezone] = useState('Asia/Tashkent');

  const [reservations, setReservations] = useState<Reservation[]>([]);
  /** Kun bo'yicha JAMI bronlar (serverning pagination.total i) */
  const [dayTotal, setDayTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /** Yuklash internet yo'qligi sababli bo'lmadi (kun ma'lumoti oflayn keshda yo'q) */
  const [loadOffline, setLoadOffline] = useState(false);
  const [day, setDay] = useState<Dayjs>(() => dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    && dayjs(dateParam).format('YYYY-MM-DD') === dateParam ? dayjs(dateParam) : inClubTime(undefined, timezone));
  const [status, setStatus] = useState<ReservationStatus | null>(null);
  const [overlapAlert, setOverlapAlert] = useState<OverlapAlert | null>(null);
  /** Holat o'tishi ketayotgan bron IDsi (tugma loading holati uchun) */
  const [transitioningId, setTransitioningId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ReservationFormValues>();

  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Array<{ value: number; label: string; name: string; phone: string | null }>>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  /** Mijoz qidiruv matni — oflayn qo'shilgan mijozlarni ham shu bo'yicha saralaymiz */
  const [customerSearch, setCustomerSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canManage = hasRole('superadmin', 'admin', 'kassir', 'operator');

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda ro'yxat
  // standart filtrlar bilan jimgina qayta yuklanib ketmasin
  const tRef = useRef(t);
  tRef.current = t;

  /**
   * So'rov navbati tokeni: kun/holat almashganda eski (sekinroq) yig'ish
   * oqimi oxirida tugab, yangi kunning ro'yxatini bosib ketmasin — har bir
   * holat yozuvi shu token tengligi bilan qo'riqlanadi.
   */
  const requestIdRef = useRef(0);

  const fetchReservations = useCallback(
    async (params: FetchParams) => {
      const requestId = (requestIdRef.current += 1);
      const isStale = () => requestIdRef.current !== requestId;
      setLoading(true);
      setLoadError(false);
      setLoadOffline(false);
      try {
        const dayStr = params.day.format('YYYY-MM-DD');
        const query = { from: dayStr, to: dayStr, status: params.status ?? undefined };
        // Kun ko'rinishi to'liq bo'lishi shart — barcha sahifalar yig'iladi,
        // aks holda band kunda bronlarning bir qismi ko'rinmay qolardi
        const first = await reservationsApi.list({ ...query, page: 1, limit: PAGE_LIMIT });
        if (isStale()) return;
        if (first.timezone) setTimezone(first.timezone);
        const total = first.pagination?.total ?? first.data.length;
        const rows = [...first.data];
        const pages = Math.min(first.pagination?.pages ?? 1, MAX_PAGES);
        for (let page = 2; page <= pages && rows.length < total; page += 1) {
          const next = await reservationsApi.list({ ...query, page, limit: PAGE_LIMIT });
          // Keyingi sahifani kutish paytida yangi so'rov boshlangan bo'lishi mumkin
          if (isStale()) return;
          if (next.data.length === 0) break;
          rows.push(...next.data);
        }
        setReservations(dedupeById(rows));
        setDayTotal(total);
      } catch (err) {
        if (isStale()) return;
        setLoadError(true);
        // Internet yo'q va bu kun oldin ochilmagan — sahifadagi ogohlantirish
        // sababini aytadi, alohida qizil xabar shart emas
        const offline = isNetworkError(err);
        setLoadOffline(offline);
        if (!offline) message.error(errorMessage(err, tRef.current('common.error')));
      } finally {
        // Eskirgan oqim yangi so'rovning yuklanish holatini o'chirmasin
        if (!isStale()) setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    const selected = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      && dayjs(dateParam).format('YYYY-MM-DD') === dateParam ? dayjs(dateParam) : inClubTime(undefined, timezone);
    setDay(selected);
    setStatus(null);
    void fetchReservations({ day: selected, status: null });
    return () => { requestIdRef.current += 1; };
  }, [fetchReservations, dateParam, timezone]);

  useEffect(() => {
    if (loading || !focusedReservation) return;
    const element = document.getElementById(`reservation-${focusedReservation}`);
    element?.scrollIntoView({ block: 'center', behavior: 'auto' });
    element?.focus({ preventScroll: true });
  }, [loading, focusedReservation, reservations]);

  const refresh = () => void fetchReservations({ day, status });

  const applyDay = (value: Dayjs | null) => {
    const next = value ?? inClubTime(undefined, timezone);
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      params.set('date', next.format('YYYY-MM-DD'));
      params.delete('reservation');
      return params;
    }, { replace: true });
  };

  const applyStatus = (value: ReservationStatus | undefined) => {
    const next = value ?? null;
    setStatus(next);
    void fetchReservations({ day, status: next });
  };

  /**
   * OFLAYN QOPLAMA — navbatdagi bronlar va holat o'zgarishlari kun ro'yxati
   * ustiga qo'yiladi ("Yuborilmagan" belgisi bilan). Server rad etgan bron
   * ham ko'rinadi — qizil belgi va sabab bilan, jimgina yo'qolmaydi.
   */
  const dayKey = day.format('YYYY-MM-DD');
  const rows = useMemo(
    () => applyReservationOps(reservations, entries, {
      day: dayKey,
      status,
      dayOf: (iso) => inClubTime(iso, timezone).format('YYYY-MM-DD'),
    }),
    [reservations, entries, dayKey, status, timezone],
  );
  /** Kun jami: server soni + shu kunning yuborilmagan bronlari */
  const shownTotal = dayTotal + rows.filter((r) => r.offlineLocalId).length;

  // Navbatdagi bron amali serverga yetdi (yoki voz kechildi) — kun qayta olinadi
  const reservationOps = useMemo(
    () => countOps(entries, ['reservation.create', 'reservation.status']),
    [entries],
  );
  const prevReservationOps = useRef(reservationOps);
  const viewRef = useRef({ day, status });
  viewRef.current = { day, status };
  useEffect(() => {
    if (reservationOps < prevReservationOps.current && online) void fetchReservations(viewRef.current);
    prevReservationOps.current = reservationOps;
  }, [reservationOps, online, fetchReservations]);

  // ---------- Stol bo'yicha guruhlash ----------
  const groups = useMemo(() => {
    const map = new Map<number, { table: Reservation['table']; items: ReservationView[] }>();
    for (const reservation of rows) {
      const entry = map.get(reservation.tableId) ?? { table: reservation.table, items: [] };
      entry.items.push(reservation);
      map.set(reservation.tableId, entry);
    }
    return [...map.values()].sort(
      (a, b) => (a.table?.number ?? 0) - (b.table?.number ?? 0),
    );
  }, [rows]);

  const displayName = (reservation: ReservationView) =>
    reservation.customerName ?? reservation.customer?.name ?? t('reservations.noCustomer');

  // ---------- Holat o'tishlari ----------
  /**
   * Internet yo'q (yoki aynan shu so'rovda uzildi) — holat o'zgarishi AYNAN
   * SHU kalit bilan navbatga tushadi va ekranda darhol ko'rinadi. Oflayn
   * yaratilgan (serverda hali yo'q) bron uchun amal har doim navbatga
   * qo'yiladi — u yaratish amalidan keyin, `$local:` havola bilan yuboriladi.
   */
  const transition = async (reservation: ReservationView, next: ReservationNextStatus) => {
    setTransitioningId(reservation.id);
    const key = newOpKey();
    const at = opNow();
    const ref = reservationRefOf(reservation);
    // Shu bron bo'yicha oldingi amal (yoki uning o'zini yaratish) navbatda —
    // yangi holat ham uning ORTIDAN yuboriladi
    const behindQueue = !!reservation.offlineLocalId || hasQueuedDeps(entries, [depKeys.reservation(ref)]);
    const saveOffline = async () => {
      await queueReservationStatus(
        {
          ref,
          name: displayName(reservation),
          timeLabel: inClubTime(reservation.startsAt, timezone).format('DD.MM HH:mm'),
        },
        next,
        key,
        at,
      );
      message.success(online && behindQueue ? t('reservations.queuedBehind') : t('offline.savedOffline'));
    };
    try {
      if (!online || behindQueue) {
        await saveOffline();
        return;
      }
      const res =
        next === 'cancelled'
          ? await reservationsApi.cancel(reservation.id, key)
          : await reservationsApi.update(reservation.id, { status: next }, key);
      message.success(res.message);
      refresh();
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await saveOffline();
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
        }
        return;
      }
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTransitioningId(null);
    }
  };

  // ---------- Yaratish ----------
  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      startsAt: day.format('YYYY-MM-DD') === inClubTime(undefined, timezone).format('YYYY-MM-DD')
        ? inClubTime(undefined, timezone).add(1, 'hour').startOf('hour')
        : day.hour(12).minute(0).second(0),
    });
    setCreateOpen(true);
    if (tables.length === 0) {
      setTablesLoading(true);
      tablesApi
        .list()
        .then((res) => setTables(res.data.filter((table) => table.isActive)))
        .catch((err) => message.error(errorMessage(err, t('common.error'))))
        .finally(() => setTablesLoading(false));
    }
  };

  const searchCustomers = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setCustomerSearch(value);
    if (!value.trim()) {
      setCustomerOptions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setCustomerSearching(true);
      const toOption = (customer: { id: number; name: string; phone: string | null }) => ({
        value: customer.id,
        label: customer.phone ? `${customer.name} · ${customer.phone}` : customer.name,
        name: customer.name,
        phone: customer.phone,
      });
      customersApi
        .list({ search: value.trim(), limit: 10 })
        .then((res) => setCustomerOptions(res.data.map(toOption)))
        .catch(async (err) => {
          // Internetsiz: shu kassada saqlangan mijozlar katalogidan qidiramiz
          // (customer-directory.ts — Stollar sahifasi uni onlayn paytda yangilaydi)
          if (isNetworkError(err)) {
            try {
              const directory = await loadCustomerDirectory();
              setCustomerOptions(
                directory.customers.filter((c) => customerMatches(c, value)).slice(0, 10).map(toOption),
              );
              return;
            } catch {
              // katalog ham saqlanmagan — tanlov bo'sh, ism/telefonni qo'lda yozish mumkin
            }
          }
          setCustomerOptions([]);
        })
        .finally(() => setCustomerSearching(false));
    }, 350);
  };

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  /**
   * Internetsiz qo'shilgan (hali yuborilmagan) mijozlar ham tanlovda — qiymati
   * `$local:` havola: bron ham navbatga tushadi va yuborishda mijozning
   * haqiqiy ID siga bog'lanadi.
   */
  const localCustomerOptions = useMemo(
    () => offlineCustomerOptions(entries, customerSearch).map((c) => ({
      value: c.value,
      label: `${c.phone ? `${c.name} · ${c.phone}` : c.name} (${t('reservations.offlinePending')})`,
      name: c.name,
      phone: c.phone,
    })),
    [entries, customerSearch, t],
  );

  /**
   * Oflayn bron: oldindan to'qnashuv tekshiruvi + navbatga yozish.
   *  · `behindCustomer` — internet bor, lekin mijoz hali navbatda (oflayn qo'shilgan);
   *  · `precheck: false` — onlayn so'rov javobsiz qolgan: server uni BAJARGAN
   *    bo'lishi mumkin, shuning uchun lokal to'qnashuv tekshiruvi bilan
   *    to'xtatilmaydi — AYNAN SHU kalit bilan navbatga yoziladi. Server
   *    bajargan bo'lsa takror uning javobini qaytaradi, bajarmagan bo'lsa
   *    to'qnashuvni o'zi aniqlab, aniq sabab bilan rad etadi.
   */
  const saveCreateOffline = async (
    values: ReservationFormValues,
    startsAtIso: string,
    key: string,
    at: number,
    { behindCustomer = false, precheck = true }: { behindCustomer?: boolean; precheck?: boolean } = {},
  ): Promise<boolean> => {
    const createdDay = inClubTime(startsAtIso, timezone);
    // Shu kun ekranda bo'lsa — server ro'yxati + navbatdagi bronlar bilan
    // solishtiramiz. Server baribir qayta tekshiradi va rad etadi; bu yerda
    // to'xtatish kassirga mijoz oldida darhol aniq javob beradi.
    const sameDay = !precheck ? [] : createdDay.format('YYYY-MM-DD') === dayKey
      ? rows
      : applyReservationOps([], entries, {
        day: createdDay.format('YYYY-MM-DD'),
        status: null,
        dayOf: (iso) => inClubTime(iso, timezone).format('YYYY-MM-DD'),
      });
    const [conflict] = findReservationOverlaps(sameDay, {
      tableId: values.tableId,
      startsAt: startsAtIso,
      durationMinutes: values.durationMinutes ?? null,
    });
    if (conflict) {
      message.warning(t('reservations.offlineConflictLocal', {
        time: inClubTime(conflict.startsAt, timezone).format('HH:mm'),
        name: displayName(conflict),
      }));
      return false;
    }
    const table = tables.find((item) => item.id === values.tableId);
    const picked = [...customerOptions, ...localCustomerOptions].find((o) => o.value === values.customerId);
    await queueReservationCreate(
      {
        tableId: values.tableId,
        tableName: table?.name ?? `#${values.tableId}`,
        tableNumber: table?.number ?? null,
        customerId: values.customerId ?? null,
        // Ism/telefon bo'sh bo'lsa tanlangan mijozniki — ro'yxatda va navbatda ko'rinsin
        customerName: values.customerName || picked?.name || undefined,
        customerPhone: values.customerPhone || picked?.phone || undefined,
        startsAt: startsAtIso,
        durationMinutes: values.durationMinutes ?? null,
        notes: values.notes || undefined,
      },
      createdDay.format('DD.MM HH:mm'),
      key,
      at,
    );
    message.success(behindCustomer ? t('reservations.queuedBehindCustomer') : t('offline.savedOffline'));
    setCreateOpen(false);
    form.resetFields();
    if (createdDay.format('YYYY-MM-DD') !== dayKey) applyDay(createdDay);
    return true;
  };

  const handleCreate = async () => {
    let values: ReservationFormValues;
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      values = await form.validateFields();
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(errorMessage(err, t('common.error')));
      return;
    }
    const startsAtIso = clubWallTimeToIso(values.startsAt, timezone);
    const key = newOpKey();
    const at = opNow();
    setSaving(true);
    try {
      // Oflayn qo'shilgan mijozga bron — mijoz serverda hali yo'q, shuning
      // uchun bron ham navbatga (mijozdan KEYIN) yoziladi
      if (!online || isLocalRef(values.customerId)) {
        await saveCreateOffline(values, startsAtIso, key, at, { behindCustomer: online });
        return;
      }
      const res = await reservationsApi.create({
        tableId: values.tableId,
        customerId: typeof values.customerId === 'number' ? values.customerId : undefined,
        customerName: values.customerName || undefined,
        customerPhone: values.customerPhone || undefined,
        startsAt: startsAtIso,
        durationMinutes: values.durationMinutes ?? undefined,
        notes: values.notes || undefined,
      }, key);
      message.success(res.message);
      // To'qnashuv — qat'iy blok emas: ogohlantirish alohida Alert da qoladi
      if (res.warning) {
        setOverlapAlert({ text: res.warning, overlaps: res.overlaps ?? [] });
      } else {
        setOverlapAlert(null);
      }
      setCreateOpen(false);
      form.resetFields();
      // Yangi bron boshqa kunga tegishli bo'lsa — o'sha kunga o'tamiz
      const createdDay = inClubTime(res.data.startsAt, timezone);
      if (createdDay.format('YYYY-MM-DD') !== day.format('YYYY-MM-DD')) {
        applyDay(createdDay);
      } else {
        refresh();
      }
    } catch (err) {
      // Aloqa aynan shu so'rovda uzildi — bron yo'qolmasin, AYNAN SHU kalit bilan navbatga
      if (isNetworkError(err)) {
        try {
          await saveCreateOffline(values, startsAtIso, key, at, { precheck: false });
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
        }
        return;
      }
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const timeChip = (reservation: Reservation) => {
    const start = inClubTime(reservation.startsAt, timezone);
    const end = start.add(reservation.durationMinutes ?? DEFAULT_DURATION_MIN, 'minute');
    return (
      <Tag
        icon={<ClockCircleOutlined />}
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          background: TOKENS.color.emerald.deep,
          borderColor: TOKENS.color.emerald.felt,
          color: TOKENS.color.emerald.glow,
          marginInlineEnd: 0,
        }}
      >
        {start.format('HH:mm')}–{end.format('HH:mm')}
      </Tag>
    );
  };

  /** Oflayn belgilar: yuborilmagan bron/holat — ko'k, server rad etgani — qizil */
  const offlineTag = (reservation: ReservationView) => {
    if (reservation.offlineMark === 'failed') {
      return (
        <Tooltip title={t('reservations.offlineFailedHint', { reason: reservation.offlineError ?? t('common.error') })}>
          <Tag color="error" icon={<ExclamationCircleOutlined />}>{t('reservations.offlineFailed')}</Tag>
        </Tooltip>
      );
    }
    if (reservation.offlineLocalId || reservation.offlineStatusPending) {
      return (
        <Tooltip title={reservation.offlineLocalId ? t('reservations.offlinePendingHint') : t('reservations.offlineStatusHint')}>
          <Tag color="processing" icon={<CloudUploadOutlined />}>{t('reservations.offlinePending')}</Tag>
        </Tooltip>
      );
    }
    return null;
  };

  const rowActions = (reservation: ReservationView) => {
    if (!canManage) return null;
    // Server rad etgan oflayn bron serverda yo'q — unga amal yuborib bo'lmaydi,
    // kassir uni "Yuborilmagan amallar" oynasida hal qiladi
    if (reservation.offlineLocalId && reservation.offlineMark === 'failed') return null;
    const isBusy = transitioningId === reservation.id;
    const actions: ReactNode[] = [];

    if (reservation.status === 'pending') {
      actions.push(
        <Button
          key="confirm"
          size="small"
          icon={<CheckOutlined />}
          loading={isBusy}
          onClick={() => void transition(reservation, 'confirmed')}
        >
          {t('reservations.actionConfirm')}
        </Button>,
      );
    }
    if (reservation.status === 'pending' || reservation.status === 'confirmed') {
      actions.push(
        <Button
          key="seat"
          size="small"
          type="primary"
          ghost
          icon={<PlayCircleOutlined />}
          loading={isBusy}
          onClick={() => void transition(reservation, 'seated')}
        >
          {t('reservations.actionSeat')}
        </Button>,
        <Popconfirm
          key="noshow"
          title={t('reservations.confirmNoShow')}
          okText={t('common.yes')}
          cancelText={t('common.no')}
          onConfirm={() => void transition(reservation, 'no_show')}
        >
          <Button size="small" icon={<StopOutlined />} loading={isBusy}>
            {t('reservations.actionNoShow')}
          </Button>
        </Popconfirm>,
        <Popconfirm
          key="cancel"
          title={t('reservations.confirmCancel')}
          okText={t('common.yes')}
          cancelText={t('common.no')}
          onConfirm={() => void transition(reservation, 'cancelled')}
        >
          <Button size="small" danger type="text" icon={<CloseOutlined />} loading={isBusy}>
            {t('reservations.actionCancel')}
          </Button>
        </Popconfirm>,
      );
    }
    if (actions.length === 0) return null;
    return <Space wrap size={4}>{actions}</Space>;
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<CalendarOutlined />}
        title={t('reservations.title')}
        subtitle={t('reservations.subtitle')}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={refresh} aria-label={t('btn.refresh')} />
            {canManage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                {t('reservations.addReservation')}
              </Button>
            )}
          </>
        }
      />

      {overlapAlert && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setOverlapAlert(null)}
          style={{ marginBottom: TOKENS.spacing.md }}
          message={overlapAlert.text || t('reservations.overlapTitle')}
          description={
            overlapAlert.overlaps.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('reservations.overlapListIntro')}
                </Text>
                <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                  {overlapAlert.overlaps.map((overlap) => (
                    <li key={overlap.id} className="tabular-nums" style={{ fontSize: 13 }}>
                      {inClubTime(overlap.startsAt, timezone).format('HH:mm')}–
                      {inClubTime(overlap.startsAt, timezone)
                        .add(overlap.durationMinutes ?? DEFAULT_DURATION_MIN, 'minute')
                        .format('HH:mm')}
                      {' — '}
                      {overlap.customerName ?? t('reservations.noCustomer')} (
                      {t(`reservations.status.${overlap.status}`)})
                    </li>
                  ))}
                </ul>
              </div>
            )
          }
        />
      )}

      {loadError && !loading && (
        <Alert
          type={loadOffline ? 'warning' : 'error'}
          showIcon
          style={{ marginBottom: TOKENS.spacing.md }}
          message={loadOffline ? t('reservations.offlineDayUnavailable') : t('common.error')}
          action={
            <Button size="small" onClick={refresh}>
              {t('btn.refresh')}
            </Button>
          }
        />
      )}

      <Card className="reservation-toolbar" style={{ marginBottom: TOKENS.spacing.md }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: TOKENS.spacing.sm,
            alignItems: 'center',
          }}
        >
          <div className="reservation-day-picker">
          <Button icon={<LeftOutlined />} onClick={() => applyDay(day.subtract(1, 'day'))} aria-label={t('workspace.previousDay')} />
          <DatePicker
            value={day}
            allowClear={false}
            onChange={applyDay}
            style={{ flex: '0 1 180px' }}
            aria-label={t('workspace.reservationDay')}
          />
          <Button icon={<RightOutlined />} onClick={() => applyDay(day.add(1, 'day'))} aria-label={t('workspace.nextDay')} />
          </div>
          <Button size="small" onClick={() => applyDay(inClubTime(undefined, timezone))}>
            {t('common.today')}
          </Button>
          <Select
            allowClear
            value={status ?? undefined}
            placeholder={t('reservations.statusAll')}
            aria-label={t('reservations.statusAll')}
            style={{ flex: '1 1 170px', maxWidth: 220 }}
            options={(['pending', 'confirmed', 'seated', 'cancelled', 'no_show'] as const).map(
              (value) => ({ value, label: t(`reservations.status.${value}`) }),
            )}
            onChange={applyStatus}
          />
          <Text type="secondary" style={{ fontSize: 13, marginInlineStart: 'auto' }}>
            <span style={{ marginInlineEnd: 12 }}>{timezone}</span>
            {t('reservations.totalForDay')}:{' '}
            <span className="tabular-nums">{shownTotal}</span>
          </Text>
        </div>
      </Card>

      {loading && (
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      )}

      {!loading && !loadError && groups.length === 0 && (
        <Card>
          <EmptyState
            icon={<CalendarOutlined />}
            title={t('reservations.emptyTitle')}
            hint={t('reservations.emptyHint')}
            action={
              canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t('reservations.addReservation')}
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!loading &&
        groups.map((group, index) => (
          <motion.div
            key={group.items[0].tableId}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: TOKENS.motion.duration.base,
              ease: TOKENS.motion.easing.out,
              delay: reduceMotion ? 0 : Math.min(index * 0.05, 0.3),
            }}
          >
            <Card
              style={{ marginBottom: TOKENS.spacing.md }}
              title={
                <Space size={8}>
                  <TableOutlined style={{ color: TOKENS.color.gold.base }} />
                  <span>{group.table?.name ?? `#${group.items[0].tableId}`}</span>
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                    {group.items.length} {t('reservations.reservationsCount')}
                  </Text>
                </Space>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: TOKENS.spacing.sm }}>
                {group.items.map((reservation) => (
                  <div
                    id={`reservation-${reservation.id}`}
                    tabIndex={reservation.id === focusedReservation ? -1 : undefined}
                    className={`reservation-item${reservation.id === focusedReservation ? ' is-focused' : ''}`}
                    key={reservation.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: TOKENS.spacing.sm,
                      padding: '10px 12px',
                      borderRadius: TOKENS.radius.sm,
                      border: `1px solid ${TOKENS.color.border.subtle}`,
                      background: TOKENS.color.bg.bg2,
                    }}
                  >
                    {timeChip(reservation)}
                    <div style={{ minWidth: 140, flex: '1 1 160px' }}>
                      <Text strong style={{ display: 'block' }}>
                        <UserOutlined style={{ marginInlineEnd: 6, color: TOKENS.color.text.tertiary }} />
                        {reservation.customerName ??
                          reservation.customer?.name ??
                          t('reservations.noCustomer')}
                      </Text>
                      {(reservation.customerPhone ?? reservation.customer?.phone) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {reservation.customerPhone ?? reservation.customer?.phone}
                        </Text>
                      )}
                      {reservation.notes && (
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, display: 'block' }}
                          ellipsis={{ tooltip: reservation.notes }}
                        >
                          {reservation.notes}
                        </Text>
                      )}
                    </div>
                    <StatusTag
                      status={STATUS_TAG_KEY[reservation.status]}
                      label={t(`reservations.status.${reservation.status}`)}
                      dot={reservation.status === 'seated'}
                    />
                    {offlineTag(reservation)}
                    {rowActions(reservation)}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}

      {/* Bron yaratish oynasi */}
      <Modal
        title={t('reservations.addReservation')}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={() => void handleCreate()}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="tableId"
            label={t('reservations.tableLabel')}
            rules={[{ required: true, message: t('reservations.tableRequired') }]}
          >
            <Select
              loading={tablesLoading}
              showSearch
              optionFilterProp="label"
              options={tables.map((table) => ({ value: table.id, label: table.name }))}
            />
          </Form.Item>
          <Form.Item name="customerId" label={t('reservations.customerLabel')}>
            <Select<number | string>
              allowClear
              showSearch
              filterOption={false}
              loading={customerSearching}
              placeholder={t('reservations.customerPlaceholder')}
              onSearch={searchCustomers}
              options={[...localCustomerOptions, ...customerOptions]}
              notFoundContent={null}
            />
          </Form.Item>
          <Form.Item name="customerName" label={t('reservations.customerNameLabel')}>
            <Input maxLength={100} placeholder={t('reservations.customerNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="customerPhone" label={t('reservations.customerPhoneLabel')}>
            <Input maxLength={20} inputMode="tel" />
          </Form.Item>
          <Form.Item
            name="startsAt"
            label={t('reservations.startLabel')}
            rules={[{ required: true, message: t('reservations.startRequired') }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm', minuteStep: 5 }}
              format="DD.MM.YYYY HH:mm"
              style={{ width: '100%' }}
              allowClear={false}
            />
          </Form.Item>
          <Form.Item name="durationMinutes" label={t('reservations.durationLabel')}>
            <InputNumber
              style={{ width: '100%' }}
              min={15}
              max={1440}
              step={15}
              placeholder={t('reservations.durationPlaceholder')}
            />
          </Form.Item>
          <Form.Item name="notes" label={t('reservations.notesLabel')}>
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </PageTransition>
  );
};

export default Reservations;
