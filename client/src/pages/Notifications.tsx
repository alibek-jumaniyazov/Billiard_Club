import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Grid,
  Input,
  Pagination,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  DeleteOutlined,
  PushpinOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorMessage, notificationsApi } from '../api';
import { ClampedBody, EmptyState, PageHeader, PageTransition, StatusTag } from '../components/ui';
import {
  NOTIFICATION_PINNED_TYPES,
  NOTIFICATION_READ_FILTERS,
  NOTIFICATION_TAG_KEY,
  NOTIFICATION_TYPES,
  type NotificationReadFilter,
} from '../constants';
import { useNotifications } from '../context/NotificationsContext';
import { TOKENS } from '../theme/tokens';
import type { ClubNotification, ClubNotificationType } from '../types';
import { dateGroupKey, formatDateTime, formatNumber, type DateGroupKey } from '../utils/format';

dayjs.extend(relativeTime);

const { Text } = Typography;

const KNOWN_TYPES = new Set<string>(NOTIFICATION_TYPES);

/** Sana guruhlari — ro'yxatdagi ko'rinish tartibi */
const DATE_GROUP_ORDER: DateGroupKey[] = ['today', 'yesterday', 'week', 'earlier'];

/** Bitta sahifadagi xabarlar soni */
const PAGE_SIZE = 20;

/** Holat filtri -> i18n kaliti */
const STATUS_LABEL_KEY: Record<NotificationReadFilter, string> = {
  all: 'notifications.statusAll',
  unread: 'notifications.statusUnread',
  read: 'notifications.statusRead',
};

const typeKeyOf = (type: string): ClubNotificationType =>
  (KNOWN_TYPES.has(type) ? type : 'info') as ClubNotificationType;

interface ListParams {
  page: number;
  pageSize: number;
  status: NotificationReadFilter;
  type?: string;
  search?: string;
  /** Fon so'rovi — skelet ko'rsatilmaydi va ko'rinib turgan xato o'chirilmaydi */
  background?: boolean;
}

/* ------------------------------------------------------------------ Qator */

interface RowProps {
  item: ClubNotification;
  pinned: boolean;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onOpen: (item: ClubNotification) => void;
  onToggleRead: (item: ClubNotification) => void;
  onDelete: (item: ClubNotification) => void;
  isMobile: boolean;
}

/**
 * Xabarnoma qatori.
 *
 * Qator o'zi `role="button"` EMAS (ilgari shunday edi): 5000 belgilik
 * matn butunligicha tugmaning nomiga aylanib qolar, ichidagi tugmalar esa
 * ichma-ich joylashgan interaktiv elementlar bo'lib chiqardi. Endi har bir
 * amalning o'z tugmasi va o'z nomi bor.
 */
const NotificationRow = ({
  item,
  pinned,
  selected,
  onSelect,
  onOpen,
  onToggleRead,
  onDelete,
  isMobile,
}: RowProps) => {
  const { t } = useTranslation();
  const unread = !item.readAt;
  const typeKey = typeKeyOf(item.type);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: TOKENS.spacing.sm,
        minWidth: 0,
        padding: '12px 14px',
        marginBottom: TOKENS.spacing.xs,
        borderRadius: TOKENS.radius.sm,
        background: unread ? TOKENS.color.bg.bg2 : 'transparent',
        border: `1px solid ${unread ? TOKENS.color.gold.line : TOKENS.color.border.subtle}`,
        borderInlineStart: unread
          ? `3px solid ${TOKENS.color.gold.base}`
          : `3px solid ${TOKENS.color.border.subtle}`,
        transition: `background ${TOKENS.motion.duration.fast}s ${TOKENS.motion.easing.cssOut}`,
      }}
    >
      <Checkbox
        checked={selected}
        onChange={(e) => onSelect(item.id, e.target.checked)}
        aria-label={item.title}
        style={{ marginTop: 4 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: TOKENS.spacing.xs,
            minWidth: 0,
          }}
        >
          {pinned && (
            <Tooltip title={t('notifications.pinnedHint')}>
              <PushpinOutlined style={{ color: TOKENS.color.gold.base, fontSize: 13 }} />
            </Tooltip>
          )}
          <Button
            type="link"
            onClick={() => onOpen(item)}
            style={{
              padding: 0,
              height: 'auto',
              flex: '1 1 240px',
              minWidth: 0,
              textAlign: 'start',
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              fontWeight: unread ? 600 : 400,
              color: TOKENS.color.text.primary,
            }}
          >
            {item.title}
          </Button>
          {unread && <StatusTag status="unread" label={t('notifications.newBadge')} dot />}
          <StatusTag
            status={NOTIFICATION_TAG_KEY[typeKey]}
            label={t(`notifications.type.${typeKey}`)}
            dot={false}
          />
          {/* Aniq sana ko'rinib turadi, nisbiy vaqt — tooltipda: sensorli
              ekranda hover yo'q, shuning uchun muhimi ko'rinadigani bo'lsin */}
          <Tooltip title={dayjs(item.createdAt).fromNow()}>
            <Text
              type="secondary"
              className="tabular-nums"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {formatDateTime(item.createdAt)}
            </Text>
          </Tooltip>
        </div>

        <ClampedBody
          text={item.body}
          rows={isMobile ? 2 : 3}
          expandLabel={t('notifications.expand')}
          collapseLabel={t('notifications.collapse')}
          muted={!unread}
          style={{ marginTop: 6 }}
        />
      </div>

      <Space size={2} style={{ flexShrink: 0 }}>
        <Tooltip title={unread ? t('notifications.markRead') : t('notifications.markUnread')}>
          <Button
            size="small"
            type="text"
            icon={unread ? <CheckOutlined /> : <UndoOutlined />}
            aria-label={unread ? t('notifications.markRead') : t('notifications.markUnread')}
            onClick={() => onToggleRead(item)}
          />
        </Tooltip>
        <Popconfirm
          title={t('notifications.deleteConfirm')}
          okText={t('common.yes')}
          cancelText={t('common.no')}
          okButtonProps={{ danger: true }}
          onConfirm={() => onDelete(item)}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('btn.delete')} />
        </Popconfirm>
      </Space>
    </div>
  );
};

/* ----------------------------------------------------------------- Sahifa */

const Notifications = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  // Birinchi renderda screens bo'sh — desktop deb qaraladi (sakrash bo'lmasin)
  const isMobile = screens.lg === false;

  const { unreadCount, syncUnread, bump, version } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<ClubNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<NotificationReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<ClubNotification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * Yopishtirilgan (pinned) xabarlar sahifa YUKLANGANDA muzlatiladi: aks
   * holda foydalanuvchi "o'qildi" deb belgilashi bilan qator "Muhim"
   * bo'limidan sana guruhiga sakrab o'tib ketardi.
   */
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda ro'yxat
  // 1-sahifaga jimgina qaytib ketmasin
  const tRef = useRef(t);
  tRef.current = t;

  /** Kech kelgan javob yangisini bosib ketmasin */
  const reqIdRef = useRef(0);
  /** Ochiq drawer IDsi — eskirgan detal javobini rad etish uchun */
  const activeDetailRef = useRef<number | null>(null);

  const fetchList = useCallback(async (params: ListParams) => {
    const reqId = ++reqIdRef.current;
    if (!params.background) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const res = await notificationsApi.list({
        page: params.page,
        limit: params.pageSize,
        status: params.status === 'all' ? undefined : params.status,
        type: params.type,
        search: params.search || undefined,
      });
      if (reqId !== reqIdRef.current) return;

      setItems(res.data);
      setTotal(res.pagination?.total ?? res.data.length);
      syncUnread(res.unreadCount);
      setPinnedIds(
        new Set(
          res.data
            .filter((n) => !n.readAt && NOTIFICATION_PINNED_TYPES.includes(n.type))
            .map((n) => n.id),
        ),
      );
      // Sahifadan yo'qolgan yozuvlar tanlovda osilib qolmasin
      const visible = new Set(res.data.map((n) => n.id));
      setSelected((prev) => new Set([...prev].filter((id) => visible.has(id))));
      setLoadError(null);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      // Fon so'rovi ko'rinib turgan ro'yxatni buzmaydi
      if (!params.background) setLoadError(errorMessage(err, tRef.current('common.error')));
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [syncUnread]);

  /** Joriy filtrlar bilan qayta yuklash */
  const reload = useCallback(
    (background = false) =>
      fetchList({ page, pageSize, status, type: typeFilter, search, background }),
    [fetchList, page, pageSize, status, typeFilter, search],
  );

  useEffect(() => {
    void fetchList({ page: 1, pageSize: PAGE_SIZE, status: 'all' });
  }, [fetchList]);

  // Polling: kontekst tsikli `version` ni oshirganda jimgina yangilanadi
  const firstVersionRef = useRef(version);
  useEffect(() => {
    if (version === firstVersionRef.current) return;
    void reload(true);
    // reload har filtr o'zgarishida qayta yaratiladi — bu yerda faqat
    // `version` o'zgarishiga reaksiya kerak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  /* ---------------------------------------------------------- Filtrlar */

  const applyFilters = (next: Partial<ListParams>) => {
    const merged: ListParams = {
      page: 1,
      pageSize,
      status,
      type: typeFilter,
      search,
      ...next,
    };
    if (next.status !== undefined) setStatus(next.status);
    if ('type' in next) setTypeFilter(next.type);
    if (next.search !== undefined) setSearch(next.search);
    setPage(merged.page);
    void fetchList(merged);
  };

  const hasFilters = status !== 'all' || !!typeFilter || !!search;

  const statusOptions = useMemo(
    () =>
      NOTIFICATION_READ_FILTERS.map((value) => ({
        value,
        label: t(STATUS_LABEL_KEY[value]),
      })),
    [t],
  );

  /* ------------------------------------------------------------ Amallar */

  const applyMutation = (res: { unreadCount?: number }) => {
    syncUnread(res.unreadCount);
    bump();
  };

  const toggleRead = async (item: ClubNotification) => {
    const nextRead = !item.readAt;
    const readAt = nextRead ? new Date().toISOString() : null;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt } : n)));
    setDetail((prev) => (prev && prev.id === item.id ? { ...prev, readAt } : prev));
    try {
      const res = nextRead
        ? await notificationsApi.read(item.id)
        : await notificationsApi.unread(item.id);
      applyMutation(res);
    } catch (err) {
      // Optimistik holatni qaytaramiz
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: item.readAt } : n)));
      setDetail((prev) => (prev && prev.id === item.id ? { ...prev, readAt: item.readAt } : prev));
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const removeOne = async (item: ClubNotification) => {
    try {
      const res = await notificationsApi.remove(item.id);
      applyMutation(res);
      if (detail?.id === item.id) closeDetail();
      // Oxirgi yozuv o'chirilsa oldingi sahifaga tushamiz
      const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage);
      void fetchList({ page: nextPage, pageSize, status, type: typeFilter, search });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const readAll = async () => {
    setBusy(true);
    try {
      const res = await notificationsApi.readAll();
      message.success(res.message);
      applyMutation(res);
      void reload();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  const bulkSetRead = async (read: boolean) => {
    setBusy(true);
    try {
      const res = await notificationsApi.bulkRead([...selected], read);
      message.success(res.message);
      applyMutation(res);
      setSelected(new Set());
      void reload();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  const bulkRemove = async () => {
    setBusy(true);
    try {
      const res = await notificationsApi.bulkRemove([...selected]);
      message.success(res.message);
      applyMutation(res);
      setSelected(new Set());
      const nextPage = items.length === selected.size && page > 1 ? page - 1 : page;
      setPage(nextPage);
      void fetchList({ page: nextPage, pageSize, status, type: typeFilter, search });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------- Detal */

  const closeDetail = useCallback(() => {
    activeDetailRef.current = null;
    setDetail(null);
    setDetailLoading(false);
    if (searchParams.has('id')) {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openDetail = (item: ClubNotification) => {
    activeDetailRef.current = item.id;
    setDetail(item);
    setDetailLoading(false);
    // Ochish = o'qish. Qaytarish uchun drawer'da "o'qilmagan" tugmasi bor.
    if (!item.readAt) void toggleRead(item);
  };

  // Chuqur havola: /notifications?id=123
  const deepLinkId = searchParams.get('id');
  useEffect(() => {
    if (!deepLinkId) return;
    const id = Number(deepLinkId);
    if (!Number.isInteger(id) || id <= 0) return;
    if (activeDetailRef.current === id) return;

    const local = items.find((n) => n.id === id);
    if (local) {
      openDetail(local);
      return;
    }
    if (!loaded) return;

    // Joriy sahifada yo'q — alohida so'rab olamiz
    activeDetailRef.current = id;
    setDetailLoading(true);
    notificationsApi
      .detail(id)
      .then((res) => {
        if (activeDetailRef.current !== id) return;
        setDetail(res.data);
        if (!res.data.readAt) void toggleRead(res.data);
      })
      .catch((err) => {
        if (activeDetailRef.current !== id) return;
        message.error(errorMessage(err, tRef.current('common.error')));
        closeDetail();
      })
      .finally(() => {
        if (activeDetailRef.current === id) setDetailLoading(false);
      });
    // items/loaded o'zgarishida qayta baholanadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, items, loaded]);

  /* ----------------------------------------------------------- Guruhlar */

  const groups = useMemo(() => {
    const pinned: ClubNotification[] = [];
    const byDate = new Map<DateGroupKey, ClubNotification[]>();

    for (const item of items) {
      if (pinnedIds.has(item.id)) {
        pinned.push(item);
        continue;
      }
      const key = dateGroupKey(item.createdAt);
      const bucket = byDate.get(key);
      if (bucket) bucket.push(item);
      else byDate.set(key, [item]);
    }

    const result: { key: string; label: string; items: ClubNotification[] }[] = [];
    if (pinned.length > 0) {
      result.push({ key: 'pinned', label: t('notifications.group.pinned'), items: pinned });
    }
    for (const key of DATE_GROUP_ORDER) {
      const bucket = byDate.get(key);
      if (bucket?.length) {
        result.push({ key, label: t(`notifications.group.${key}`), items: bucket });
      }
    }
    return result;
  }, [items, pinnedIds, t]);

  const pageIds = useMemo(() => items.map((n) => n.id), [items]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleSelect = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  /* ------------------------------------------------------------- Render */

  const detailType = detail ? typeKeyOf(detail.type) : 'info';

  return (
    <PageTransition>
      <PageHeader
        icon={<BellOutlined />}
        title={t('notifications.title')}
        subtitle={
          <span aria-live="polite" aria-atomic="true">
            {t('notifications.unreadCount')}:{' '}
            <span className="tabular-nums" style={{ color: TOKENS.color.gold.base, fontWeight: 600 }}>
              {unreadCount}
            </span>
          </span>
        }
        extra={
          <>
            <Tooltip title={t('btn.refresh')}>
              <Button
                icon={<ReloadOutlined />}
                loading={loading && loaded}
                onClick={() => void reload()}
                aria-label={t('btn.refresh')}
              />
            </Tooltip>
            <Tooltip title={t('notifications.readAll')}>
              <Button
                icon={<CheckOutlined />}
                disabled={unreadCount === 0}
                loading={busy}
                onClick={() => void readAll()}
                aria-label={t('notifications.readAll')}
              >
                {isMobile ? null : t('notifications.readAll')}
              </Button>
            </Tooltip>
          </>
        }
      />

      {loadError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: TOKENS.spacing.md }}
          message={loadError}
          action={
            <Button size="small" onClick={() => void reload()}>
              {t('btn.refresh')}
            </Button>
          }
        />
      )}

      {/* Asboblar paneli — header ostiga yopishadi */}
      <Card
        style={{
          marginBottom: TOKENS.spacing.md,
          position: 'sticky',
          top: 64,
          zIndex: 5,
        }}
        styles={{ body: { padding: TOKENS.spacing.sm } }}
      >
        <Space wrap size={TOKENS.spacing.xs} style={{ width: '100%' }}>
          <Input.Search
            allowClear
            placeholder={t('notifications.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(value) => applyFilters({ search: value.trim() })}
            style={{ width: isMobile ? '100%' : 300 }}
          />

          {isMobile ? (
            <Select
              value={status}
              style={{ width: 160 }}
              onChange={(value: NotificationReadFilter) => applyFilters({ status: value })}
              options={statusOptions}
            />
          ) : (
            <Segmented
              value={status}
              onChange={(value) => applyFilters({ status: value as NotificationReadFilter })}
              options={statusOptions}
            />
          )}

          <Select
            allowClear
            value={typeFilter}
            placeholder={t('notifications.filterType')}
            style={{ width: 180 }}
            onChange={(value) => applyFilters({ type: value })}
            options={NOTIFICATION_TYPES.map((value) => ({
              value,
              label: t(`notifications.type.${value}`),
            }))}
          />
        </Space>
      </Card>

      {/* Ommaviy amallar — faqat tanlov bo'lganda */}
      {selected.size > 0 && (
        <Card
          style={{
            marginBottom: TOKENS.spacing.md,
            borderColor: TOKENS.color.gold.line,
            background: TOKENS.color.gold.subtle,
          }}
          styles={{ body: { padding: `${TOKENS.spacing.xs}px ${TOKENS.spacing.sm}px` } }}
        >
          <Space wrap size={TOKENS.spacing.xs} style={{ width: '100%' }}>
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selected.size > 0}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(pageIds) : new Set())
              }
            >
              {t('notifications.selectedCount', { count: selected.size })}
            </Checkbox>
            <Button size="small" icon={<CheckOutlined />} loading={busy} onClick={() => void bulkSetRead(true)}>
              {t('notifications.bulkMarkRead')}
            </Button>
            <Button size="small" icon={<UndoOutlined />} loading={busy} onClick={() => void bulkSetRead(false)}>
              {t('notifications.bulkMarkUnread')}
            </Button>
            <Popconfirm
              title={t('notifications.bulkDeleteConfirm', { count: selected.size })}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              okButtonProps={{ danger: true }}
              onConfirm={() => void bulkRemove()}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={busy}>
                {t('notifications.bulkDelete')}
              </Button>
            </Popconfirm>
            <Button size="small" type="link" onClick={() => setSelected(new Set())}>
              {t('notifications.clearSelection')}
            </Button>
          </Space>
        </Card>
      )}

      <Card>
        {!loaded ? (
          <Space direction="vertical" size={TOKENS.spacing.md} style={{ width: '100%' }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} active paragraph={{ rows: 2 }} title={{ width: '40%' }} />
            ))}
          </Space>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOutlined />}
            title={hasFilters ? t('notifications.emptyFilteredTitle') : t('notifications.emptyTitle')}
            hint={hasFilters ? t('notifications.emptyFilteredHint') : t('notifications.emptyHint')}
            action={
              hasFilters ? (
                <Button
                  onClick={() => {
                    setSearchInput('');
                    applyFilters({ status: 'all', type: undefined, search: '' });
                  }}
                >
                  {t('notifications.resetFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.key}>
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    margin: '12px 0 8px',
                    color:
                      group.key === 'pinned'
                        ? TOKENS.color.gold.base
                        : TOKENS.color.text.tertiary,
                  }}
                >
                  {group.label}
                </Text>
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    pinned={group.key === 'pinned'}
                    selected={selected.has(item.id)}
                    onSelect={toggleSelect}
                    onOpen={openDetail}
                    onToggleRead={(n) => void toggleRead(n)}
                    onDelete={(n) => void removeOne(n)}
                    isMobile={isMobile}
                  />
                ))}
              </section>
            ))}

            <Pagination
              align="end"
              style={{ marginTop: TOKENS.spacing.md }}
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              showTotal={(n) => `${t('common.total')}: ${formatNumber(n)}`}
              onChange={(nextPage, nextSize) => {
                const targetPage = nextSize !== pageSize ? 1 : nextPage;
                setPage(targetPage);
                setPageSize(nextSize);
                void fetchList({
                  page: targetPage,
                  pageSize: nextSize,
                  status,
                  type: typeFilter,
                  search,
                });
              }}
            />
          </>
        )}
      </Card>

      {/* To'liq matn — uzun xabar shu yerda hech qanday qirqishsiz o'qiladi */}
      <Drawer
        open={detail !== null || detailLoading}
        onClose={closeDetail}
        width="min(640px, 100vw)"
        loading={detailLoading}
        title={
          detail && (
            <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', display: 'block' }}>
              {detail.title}
            </span>
          )
        }
        footer={
          detail && (
            <Space wrap>
              <Button
                icon={detail.readAt ? <UndoOutlined /> : <CheckOutlined />}
                onClick={() => void toggleRead(detail)}
              >
                {detail.readAt ? t('notifications.markUnread') : t('notifications.markRead')}
              </Button>
              <Popconfirm
                title={t('notifications.deleteConfirm')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void removeOne(detail)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  {t('btn.delete')}
                </Button>
              </Popconfirm>
              <Button type="text" onClick={closeDetail}>
                {t('btn.close')}
              </Button>
            </Space>
          )
        }
      >
        {detail && (
          <Space direction="vertical" size={TOKENS.spacing.md} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('notifications.filterType')}>
                <StatusTag
                  status={NOTIFICATION_TAG_KEY[detailType]}
                  label={t(`notifications.type.${detailType}`)}
                  dot={false}
                />
              </Descriptions.Item>
              <Descriptions.Item label={t('notifications.sentAt')}>
                <span className="tabular-nums">{formatDateTime(detail.createdAt)}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('notifications.readAt')}>
                {detail.readAt ? (
                  <span className="tabular-nums">{formatDateTime(detail.readAt)}</span>
                ) : (
                  <Text type="secondary">{t('notifications.notRead')}</Text>
                )}
              </Descriptions.Item>
            </Descriptions>

            <div
              style={{
                background: TOKENS.color.bg.bg2,
                border: `1px dashed ${TOKENS.color.gold.line}`,
                borderRadius: TOKENS.radius.sm,
                padding: '14px 16px',
              }}
            >
              {/* rows={0} — clamp umuman qo'llanmaydi, matn to'liq ko'rinadi */}
              <ClampedBody text={detail.body} rows={0} maxWidth="68ch" />
            </div>
          </Space>
        )}
      </Drawer>
    </PageTransition>
  );
};

export default Notifications;
