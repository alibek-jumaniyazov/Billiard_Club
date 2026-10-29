import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';
import {
  App,
  Button,
  Col,
  Grid,
  Pagination,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Skeleton,
  Spin,
  Table,
  Tooltip,
} from 'antd';
import {
  CloseCircleOutlined,
  CoffeeOutlined,
  DisconnectOutlined,
  DollarOutlined,
  DownOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  StopOutlined,
  UpOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorMessage, ordersApi, tablesApi } from '../api';
import {
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatCard,
  StatusTag,
} from '../components/ui';
import { useCurrency } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { BilliardTable, Order, OrderStatus, OrderTodayStats } from '../types';
import { formatDateTime, formatNumber } from '../utils/format';
import {
  groupOrderItems,
  KPI_GAP,
  orderTimeLabel,
  ordersPageLayout,
  type OrderLine,
  type OrdersPageLayout,
} from '../utils/orders';
import '../styles/orders.css';

/** Buyurtma holati -> StatusTag semantik kaliti */
const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  open: 'active',
  closed: 'success',
  cancelled: 'cancelled',
};

/** Holat nomi — umumiy status.* emas: ruschada buyurtma (заказ) erkak jinsida */
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'orders.statusOpen',
  closed: 'orders.statusClosed',
  cancelled: 'orders.statusCancelled',
};

type StatusFilter = OrderStatus | 'all';

const DEFAULT_PAGE_SIZE = 20;
/** Kartada shundan ko'p pozitsiya bo'lsa qolgani "Yana N ta" ostida */
const CARD_VISIBLE_LINES = 4;

/**
 * Sahifa kengligidan ko'rinish (ResizeObserver; juda eski WebView'da oyna
 * o'lchami). Holat faqat ko'rinish CHEGARASI o'tganda yangilanadi — yon menyu
 * ochilib-yopilayotganda jadval har kadrda qayta chizilmaydi.
 */
const useOrdersLayout = (ref: RefObject<HTMLElement | null>): OrdersPageLayout => {
  const [layout, setLayout] = useState(() =>
    ordersPageLayout(typeof window === 'undefined' ? 1280 : window.innerWidth - (window.innerWidth >= 992 ? 304 : 40)),
  );
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      if (element.clientWidth === 0) return;
      const next = ordersPageLayout(element.clientWidth);
      setLayout((prev) =>
        prev.list === next.list && prev.kpisPerRow === next.kpisPerRow && prev.kpiSize === next.kpiSize
          ? prev
          : next,
      );
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
};

/** Jadval qatori bosilganda ochiladi — amal tugmasi qatorni ochmasin */
const stopRowClick = (event: MouseEvent) => event.stopPropagation();

const Orders = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const currency = useCurrency();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const pageRef = useRef<HTMLDivElement>(null);
  const { list: layout, kpisPerRow, kpiSize } = useOrdersLayout(pageRef);
  // Server bilan bir xil: bekor qilish kassir/admin/superadmin uchun
  const canCancel = hasRole('superadmin', 'admin', 'kassir');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tableId, setTableId] = useState<number | undefined>();
  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [expandedCards, setExpandedCards] = useState<ReadonlySet<number>>(() => new Set());

  const [stats, setStats] = useState<OrderTodayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const ordersRequest = useRef(0);
  const statsRequest = useRef(0);
  /** Ekrandagi ro'yxat qaysi filtr/sahifaga tegishli (xato bo'lganda kerak) */
  const shownQuery = useRef<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const request = ++ordersRequest.current;
    const isCurrent = () => request === ordersRequest.current;
    const query = [page, pageSize, status, tableId ?? ''].join('|');
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (status !== 'all') params.status = status;
      if (tableId) params.tableId = tableId;
      const res = await ordersApi.list(params);
      if (!isCurrent()) return;
      setOrders(res.data);
      setTotal(res.pagination?.total ?? 0);
      shownQuery.current = query;
      setLoadFailed(false);
    } catch (err) {
      if (!isCurrent()) return;
      // Shu ro'yxatni yangilash muvaffaqiyatsiz — eski ma'lumot qoladi, xabar
      // chiqadi. Boshqa filtr ochilmagan bo'lsa — eski filtr natijasini
      // ko'rsatib chalg'itmaymiz, "qayta urinish" holati chiqadi.
      if (shownQuery.current === query) message.error(errorMessage(err, t('orders.loadError')));
      else setLoadFailed(true);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [message, t, page, pageSize, status, tableId]);

  // Bugungi statistika — server to'liq ma'lumotdan hisoblaydi. Ikkilamchi
  // ma'lumot: xatoda jim (ro'yxat xatosi baribir ko'rinadi).
  const fetchStats = useCallback(async () => {
    const request = ++statsRequest.current;
    const isCurrent = () => request === statsRequest.current;
    setStatsLoading(true);
    try {
      const res = await ordersApi.todayStats();
      if (isCurrent()) setStats(res.data);
    } catch {
      /* eski qiymat qoladi */
    } finally {
      if (isCurrent()) setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
    // Also invalidate when filters change or the page unmounts.
    return () => { ordersRequest.current += 1; };
  }, [fetchOrders]);

  useEffect(() => {
    void fetchStats();
    return () => { statsRequest.current += 1; };
  }, [fetchStats]);

  // Stol filtri uchun ro'yxat — bo'lmasa filtr shunchaki bo'sh qoladi
  useEffect(() => {
    let alive = true;
    tablesApi
      .list()
      .then((res) => {
        if (alive) setTables([...res.data].sort((a, b) => a.number - b.number));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleRefresh = () => {
    void fetchOrders();
    void fetchStats();
  };

  // Ochiq buyurtmani bekor qilish — ombor qaytadi, sessiya bar summasi kamayadi
  const handleCancel = async (order: Order) => {
    setCancellingId(order.id);
    try {
      const res = await ordersApi.cancel(order.id);
      message.success(res.message);
      void fetchOrders();
      void fetchStats();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCancellingId(null);
    }
  };

  const applyStatus = (value: StatusFilter) => {
    setStatus(value);
    setPage(1);
  };
  const applyTable = (value: number | undefined) => {
    setTableId(value);
    setPage(1);
  };
  const clearFilters = () => {
    setStatus('all');
    setTableId(undefined);
    setPage(1);
  };
  const changePage = (nextPage: number, nextSize: number) => {
    setPage(nextSize !== pageSize ? 1 : nextPage);
    setPageSize(nextSize);
  };
  const toggleCard = (id: number) =>
    setExpandedCards((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const filtersActive = status !== 'all' || tableId !== undefined;
  const tableName = (order: Order) => order.table?.name ?? t('orders.unknownTable');
  const lineName = (line: OrderLine) => line.name || t('orders.unknownProduct', { id: line.productId });
  const timeLabel = (iso: string) =>
    orderTimeLabel(iso, { today: t('orders.today'), yesterday: t('orders.yesterday') });
  const statusTag = (order: Order) => (
    <StatusTag status={ORDER_STATUS_KEYS[order.status]} label={t(ORDER_STATUS_LABELS[order.status])} />
  );

  const cancelAction = (order: Order, iconOnly: boolean) =>
    canCancel && order.status === 'open' ? (
      <Popconfirm
        title={t('orders.cancelConfirmTitle')}
        description={t('orders.cancelConfirmDesc')}
        okText={t('common.yes')}
        cancelText={t('common.no')}
        okButtonProps={{ danger: true }}
        onConfirm={() => void handleCancel(order)}
      >
        {iconOnly ? (
          <Tooltip title={t('orders.cancelOrder')}>
            <Button
              danger
              type="text"
              icon={<CloseCircleOutlined />}
              aria-label={`${t('orders.cancelOrder')} #${order.id}`}
              loading={cancellingId === order.id}
            />
          </Tooltip>
        ) : (
          <Button danger type="text" icon={<CloseCircleOutlined />} loading={cancellingId === order.id}>
            {t('orders.cancelOrder')}
          </Button>
        )}
      </Popconfirm>
    ) : null;

  /* ---------------------------------------------------------- Jadval */

  const orderCell = (order: Order) => (
    <div className="orders-cell-order">
      <span className="orders-cell-order__table">{tableName(order)}</span>
      <span className="orders-cell-order__meta" title={formatDateTime(order.createdAt)}>
        #{order.id} · {timeLabel(order.createdAt)}
      </span>
    </div>
  );

  const itemsCell = (order: Order, withUser: boolean) => {
    const lines = groupOrderItems(order.items);
    if (!lines.length) return <span className="orders-items__empty">{t('orders.noItems')}</span>;
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    return (
      <div className="orders-items">
        <span className="orders-items__list">
          {lines.map((line, index) => (
            <span key={line.productId}>
              {index > 0 && <span className="orders-items__sep" aria-hidden>·</span>}
              {lineName(line)} <b>×{line.quantity}</b>
            </span>
          ))}
        </span>
        <span className="orders-items__meta">
          {t('orders.itemsSummary', { kinds: lines.length, qty: quantity })}
          {withUser && order.user?.name ? ` · ${order.user.name}` : ''}
        </span>
      </div>
    );
  };

  const amountCell = (order: Order, withStatus: boolean) => (
    <div className={`orders-cell-amount${order.status === 'cancelled' ? ' is-void' : ''}`}>
      <MoneyText amount={order.totalAmount} currency={currency} />
      {withStatus && statusTag(order)}
    </div>
  );

  const actionColumn: ColumnsType<Order> = canCancel
    ? [{
        title: <span className="orders-sr-only">{t('common.actions')}</span>,
        key: 'actions',
        width: layout === 'full' ? 60 : 56,
        align: 'center',
        render: (_, order) => <div onClick={stopRowClick}>{cancelAction(order, true)}</div>,
      }]
    : [];

  const columns: ColumnsType<Order> =
    layout === 'full'
      ? [
          { title: t('orders.order'), key: 'order', width: 180, render: (_, order) => orderCell(order) },
          { title: t('orders.items'), key: 'items', render: (_, order) => itemsCell(order, false) },
          {
            title: t('orders.enteredBy'),
            key: 'user',
            width: 150,
            ellipsis: true,
            render: (_, order) => order.user?.name ?? '—',
          },
          { title: t('orders.status'), key: 'status', width: 140, render: (_, order) => statusTag(order) },
          {
            title: t('orders.totalAmount'),
            key: 'amount',
            width: 160,
            align: 'right',
            render: (_, order) => amountCell(order, false),
          },
          ...actionColumn,
        ]
      : [
          { title: t('orders.order'), key: 'order', width: 170, render: (_, order) => orderCell(order) },
          { title: t('orders.items'), key: 'items', render: (_, order) => itemsCell(order, true) },
          {
            title: t('orders.totalAmount'),
            key: 'amount',
            width: 150,
            align: 'right',
            render: (_, order) => amountCell(order, true),
          },
          ...actionColumn,
        ];

  /** Qator ochilganda — chek ko'rinishidagi to'liq tarkib */
  const receipt = (order: Order) => (
    <div className="orders-receipt">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('orders.items')}</th>
            <th scope="col">{t('orders.quantity')}</th>
            <th scope="col">{t('orders.price')}</th>
            <th scope="col">{t('orders.subtotal')}</th>
          </tr>
        </thead>
        <tbody>
          {groupOrderItems(order.items).map((line) => (
            <tr key={line.productId}>
              <td>{lineName(line)}</td>
              <td>×{line.quantity}</td>
              <td>{line.price === null ? '—' : formatNumber(line.price)}</td>
              <td>{formatNumber(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="orders-receipt__foot">
        <span>
          <UserOutlined aria-hidden /> {order.user?.name ?? '—'} · {formatDateTime(order.createdAt)}
        </span>
        <span className={`orders-receipt__total${order.status === 'cancelled' ? ' is-void' : ''}`}>
          {t('common.total')}
          <MoneyText amount={order.totalAmount} currency={currency} />
        </span>
      </div>
    </div>
  );

  /* ---------------------------------------------------------- Kartalar */

  const orderCard = (order: Order) => {
    const lines = groupOrderItems(order.items);
    const expanded = expandedCards.has(order.id);
    const collapsible = lines.length > CARD_VISIBLE_LINES;
    const visible = collapsible && !expanded ? lines.slice(0, CARD_VISIBLE_LINES - 1) : lines;
    const action = cancelAction(order, false);
    return (
      <article
        key={order.id}
        role="listitem"
        className={`order-card is-${order.status}`}
        aria-label={`${t('orders.order')} #${order.id}, ${tableName(order)}`}
      >
        <header className="order-card__head">
          <div className="order-card__title">
            <h4>{tableName(order)}</h4>
            <span title={formatDateTime(order.createdAt)}>
              #{order.id} · {timeLabel(order.createdAt)}
            </span>
          </div>
          <div className="order-card__amount">
            <MoneyText amount={order.totalAmount} currency={currency} />
            {statusTag(order)}
          </div>
        </header>
        <div className="order-card__body">
          {lines.length ? (
            <ul className="order-card__lines">
              {visible.map((line) => (
                <li key={line.productId}>
                  <span className="order-card__name">{lineName(line)}</span>
                  <span className="order-card__qty">×{line.quantity}</span>
                  <span className="order-card__sum">{formatNumber(line.subtotal)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="order-card__empty">{t('orders.noItems')}</p>
          )}
          {collapsible && (
            <button
              type="button"
              className="order-card__more"
              aria-expanded={expanded}
              onClick={() => toggleCard(order.id)}
            >
              {expanded
                ? t('orders.showLess')
                : t('orders.moreItems', { count: lines.length - visible.length })}
              {expanded ? <UpOutlined aria-hidden /> : <DownOutlined aria-hidden />}
            </button>
          )}
        </div>
        {(order.user?.name || action) && (
          <footer className="order-card__foot">
            <span className="order-card__user">
              {order.user?.name && (
                <>
                  <UserOutlined aria-hidden />
                  <span>{order.user.name}</span>
                </>
              )}
            </span>
            {action}
          </footer>
        )}
      </article>
    );
  };

  /* ---------------------------------------------------------- Holatlar */

  const emptyState = filtersActive ? (
    <EmptyState
      icon={<CoffeeOutlined />}
      title={t('orders.filteredEmptyTitle')}
      hint={t('orders.filteredEmptyHint')}
      action={<Button onClick={clearFilters}>{t('orders.clearFilters')}</Button>}
    />
  ) : (
    <EmptyState
      icon={<CoffeeOutlined />}
      title={t('orders.emptyTitle')}
      hint={t('orders.emptyHint')}
      action={<Button type="primary" onClick={() => navigate('/tables')}>{t('orders.goToTables')}</Button>}
    />
  );

  const failedState = (
    <EmptyState
      icon={<DisconnectOutlined />}
      title={t('orders.loadError')}
      hint={t('orders.loadErrorHint')}
      action={<Button icon={<ReloadOutlined />} onClick={handleRefresh}>{t('orders.retry')}</Button>}
    />
  );

  const tableOptions = useMemo(
    () => tables.map((table) => ({ value: table.id, label: table.name })),
    [tables],
  );
  const openCount = stats?.openCount ?? 0;
  const statusOptions = [
    { value: 'all' as const, label: t('common.all') },
    {
      value: 'open' as const,
      label: (
        <span className="orders-status-option">
          {t(ORDER_STATUS_LABELS.open)}
          {openCount > 0 && <span className="orders-status-option__count">{openCount}</span>}
        </span>
      ),
    },
    { value: 'closed' as const, label: t(ORDER_STATUS_LABELS.closed) },
    { value: 'cancelled' as const, label: t(ORDER_STATUS_LABELS.cancelled) },
  ];

  const money = (amount: number | undefined) =>
    amount === undefined ? '—' : (
      <MoneyText amount={amount} currency={currency} style={{ fontSize: 'inherit', fontWeight: 'inherit' }} />
    );
  const average = stats && stats.todayCount > 0 ? stats.todayAmount / stats.todayCount : null;
  const cancelledCount = stats?.cancelledCount ?? 0;
  const statsPending = statsLoading && stats === null;
  const kpiClass = kpiSize === 'regular' ? 'orders-kpis' : `orders-kpis is-${kpiSize}`;

  return (
    <PageTransition>
      <div ref={pageRef} className="orders-page">
        <PageHeader
          icon={<CoffeeOutlined />}
          title={t('orders.title')}
          subtitle={t('orders.subtitle')}
          stats={
            <Row gutter={[KPI_GAP, KPI_GAP]} className={kpiClass}>
              <Col span={24 / kpisPerRow}>
                <StatCard
                  label={t('orders.todayAmount')}
                  hint={t('orders.todayAmountHint')}
                  value={money(stats?.todayAmount)}
                  icon={<DollarOutlined />}
                  loading={statsPending}
                />
              </Col>
              <Col span={24 / kpisPerRow}>
                <StatCard
                  label={t('orders.todayCount')}
                  value={stats?.todayCount ?? '—'}
                  footnote={
                    average === null
                      ? undefined
                      : t('orders.averageOrder', { amount: `${formatNumber(Math.round(average))} ${currency}` })
                  }
                  icon={<ShoppingCartOutlined />}
                  accent={TOKENS.color.emerald.bright}
                  loading={statsPending}
                />
              </Col>
              <Col span={24 / kpisPerRow}>
                <StatCard
                  label={t('orders.openTabs')}
                  hint={t('orders.openTabsHint')}
                  value={money(stats?.openAmount)}
                  footnote={
                    stats?.openCount === undefined
                      ? undefined
                      : t('orders.openTabsCount', { count: stats.openCount })
                  }
                  icon={<FieldTimeOutlined />}
                  accent={TOKENS.color.semantic.info}
                  loading={statsPending}
                />
              </Col>
              <Col span={24 / kpisPerRow}>
                <StatCard
                  label={t('orders.cancelledToday')}
                  hint={t('orders.cancelledTodayHint')}
                  value={money(stats?.cancelledAmount)}
                  footnote={
                    stats?.cancelledCount === undefined
                      ? undefined
                      : t('orders.ordersCount', { count: stats.cancelledCount })
                  }
                  icon={<StopOutlined />}
                  accent={cancelledCount > 0 ? TOKENS.color.semantic.error : TOKENS.color.text.tertiary}
                  loading={statsPending}
                />
              </Col>
            </Row>
          }
        />

        <section className={`orders-panel is-${layout}`} aria-busy={loading}>
          <div className="orders-toolbar">
            <div className="orders-toolbar__status">
              <Segmented<StatusFilter>
                aria-label={t('orders.status')}
                value={status}
                options={statusOptions}
                onChange={applyStatus}
              />
            </div>
            <Select<number>
              className="orders-toolbar__table"
              aria-label={t('orders.tableFilter')}
              placeholder={t('orders.allTables')}
              value={tableId}
              options={tableOptions}
              onChange={applyTable}
              allowClear
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={false}
            />
            <div className="orders-toolbar__count" aria-live="polite">
              {loaded && !loadFailed && <span>{t('orders.ordersCount', { count: total })}</span>}
              {filtersActive && (
                <Button type="link" size="small" onClick={clearFilters}>
                  {t('orders.clearFilters')}
                </Button>
              )}
            </div>
            <Button
              className="orders-toolbar__refresh"
              icon={<ReloadOutlined spin={loading && loaded} />}
              onClick={handleRefresh}
              aria-label={t('btn.refresh')}
            >
              {layout === 'full' ? t('btn.refresh') : null}
            </Button>
          </div>

          {!loaded ? (
            layout === 'cards' ? (
              <div className="orders-cards" aria-hidden>
                {[0, 1, 2].map((key) => (
                  <div key={key} className="order-card">
                    <Skeleton active title={{ width: '45%' }} paragraph={{ rows: 3 }} />
                  </div>
                ))}
              </div>
            ) : (
              <Skeleton active paragraph={{ rows: 8 }} />
            )
          ) : loadFailed ? (
            failedState
          ) : layout === 'cards' ? (
            <>
              <Spin spinning={loading}>
                {orders.length === 0 ? (
                  emptyState
                ) : (
                  <div className="orders-cards" role="list">
                    {orders.map(orderCard)}
                  </div>
                )}
              </Spin>
              {total > pageSize && (
                <Pagination
                  className="orders-pagination"
                  responsive
                  showLessItems
                  showSizeChanger={false}
                  current={page}
                  pageSize={pageSize}
                  total={total}
                  onChange={changePage}
                />
              )}
            </>
          ) : (
            <Table<Order>
              className="orders-table"
              rowKey="id"
              size="middle"
              tableLayout="fixed"
              sticky={{ offsetHeader: screens.lg ? 76 : 68 }}
              columns={columns}
              dataSource={orders}
              loading={loading}
              scroll={{ x: layout === 'full' ? 960 : 620 }}
              rowClassName={(order) => `orders-row orders-row--${order.status}`}
              expandable={{
                expandedRowRender: receipt,
                rowExpandable: (order) => (order.items?.length ?? 0) > 0,
                expandRowByClick: true,
              }}
              locale={{ emptyText: emptyState }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                position: ['bottomRight'],
                onChange: changePage,
                hideOnSinglePage: total <= 10,
              }}
            />
          )}
        </section>
      </div>
    </PageTransition>
  );
};

export default Orders;
