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
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
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
import { customersApi, errorMessage, reservationsApi, tablesApi } from '../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { BilliardTable, Reservation, ReservationStatus } from '../types';

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

interface FetchParams {
  day: Dayjs;
  status: ReservationStatus | null;
}

interface ReservationFormValues {
  tableId: number;
  customerId?: number;
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
  const reduceMotion = useReducedMotion();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [day, setDay] = useState<Dayjs>(() => dayjs());
  const [status, setStatus] = useState<ReservationStatus | null>(null);
  const [overlapAlert, setOverlapAlert] = useState<OverlapAlert | null>(null);
  /** Holat o'tishi ketayotgan bron IDsi (tugma loading holati uchun) */
  const [transitioningId, setTransitioningId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ReservationFormValues>();

  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canManage = hasRole('superadmin', 'admin', 'kassir', 'operator');

  const fetchReservations = useCallback(
    async (params: FetchParams) => {
      setLoading(true);
      setLoadError(false);
      try {
        const dayStr = params.day.format('YYYY-MM-DD');
        const res = await reservationsApi.list({
          from: dayStr,
          to: dayStr,
          status: params.status ?? undefined,
          limit: 100,
        });
        setReservations(res.data);
      } catch (err) {
        setLoadError(true);
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [message, t],
  );

  useEffect(() => {
    void fetchReservations({ day: dayjs(), status: null });
  }, [fetchReservations]);

  const refresh = () => void fetchReservations({ day, status });

  const applyDay = (value: Dayjs | null) => {
    const next = value ?? dayjs();
    setDay(next);
    void fetchReservations({ day: next, status });
  };

  const applyStatus = (value: ReservationStatus | undefined) => {
    const next = value ?? null;
    setStatus(next);
    void fetchReservations({ day, status: next });
  };

  // ---------- Stol bo'yicha guruhlash ----------
  const groups = useMemo(() => {
    const map = new Map<number, { table: Reservation['table']; items: Reservation[] }>();
    for (const reservation of reservations) {
      const entry = map.get(reservation.tableId) ?? { table: reservation.table, items: [] };
      entry.items.push(reservation);
      map.set(reservation.tableId, entry);
    }
    return [...map.values()].sort(
      (a, b) => (a.table?.number ?? 0) - (b.table?.number ?? 0),
    );
  }, [reservations]);

  // ---------- Holat o'tishlari ----------
  const transition = async (reservation: Reservation, next: ReservationStatus) => {
    setTransitioningId(reservation.id);
    try {
      const res =
        next === 'cancelled'
          ? await reservationsApi.cancel(reservation.id)
          : await reservationsApi.update(reservation.id, { status: next });
      message.success(res.message);
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTransitioningId(null);
    }
  };

  // ---------- Yaratish ----------
  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      startsAt: day.isSame(dayjs(), 'day')
        ? dayjs().add(1, 'hour').startOf('hour')
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
    if (!value.trim()) {
      setCustomerOptions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setCustomerSearching(true);
      customersApi
        .list({ search: value.trim(), limit: 10 })
        .then((res) =>
          setCustomerOptions(
            res.data.map((customer) => ({
              value: customer.id,
              label: customer.phone ? `${customer.name} · ${customer.phone}` : customer.name,
            })),
          ),
        )
        .catch(() => setCustomerOptions([]))
        .finally(() => setCustomerSearching(false));
    }, 350);
  };

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await reservationsApi.create({
        tableId: values.tableId,
        customerId: values.customerId,
        customerName: values.customerName || undefined,
        customerPhone: values.customerPhone || undefined,
        startsAt: values.startsAt.toISOString(),
        durationMinutes: values.durationMinutes ?? undefined,
        notes: values.notes || undefined,
      });
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
      const createdDay = dayjs(res.data.startsAt);
      if (!createdDay.isSame(day, 'day')) {
        setDay(createdDay);
        void fetchReservations({ day: createdDay, status });
      } else {
        refresh();
      }
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const timeChip = (reservation: Reservation) => {
    const start = dayjs(reservation.startsAt);
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

  const rowActions = (reservation: Reservation) => {
    if (!canManage) return null;
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
                      {dayjs(overlap.startsAt).format('HH:mm')}–
                      {dayjs(overlap.startsAt)
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
          type="error"
          showIcon
          style={{ marginBottom: TOKENS.spacing.md }}
          message={t('common.error')}
          action={
            <Button size="small" onClick={refresh}>
              {t('btn.refresh')}
            </Button>
          }
        />
      )}

      <Card style={{ marginBottom: TOKENS.spacing.md }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: TOKENS.spacing.sm,
            alignItems: 'center',
          }}
        >
          <DatePicker
            value={day}
            allowClear={false}
            onChange={applyDay}
            style={{ flex: '0 1 180px' }}
          />
          <Button size="small" onClick={() => applyDay(dayjs())}>
            {t('common.today')}
          </Button>
          <Select
            allowClear
            value={status ?? undefined}
            placeholder={t('reservations.statusAll')}
            style={{ flex: '1 1 170px', maxWidth: 220 }}
            options={(['pending', 'confirmed', 'seated', 'cancelled', 'no_show'] as const).map(
              (value) => ({ value, label: t(`reservations.status.${value}`) }),
            )}
            onChange={applyStatus}
          />
          <Text type="secondary" style={{ fontSize: 13, marginInlineStart: 'auto' }}>
            {t('reservations.totalForDay')}:{' '}
            <span className="tabular-nums">{reservations.length}</span>
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
            <Select
              allowClear
              showSearch
              filterOption={false}
              loading={customerSearching}
              placeholder={t('reservations.customerPlaceholder')}
              onSearch={searchCustomers}
              options={customerOptions}
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
