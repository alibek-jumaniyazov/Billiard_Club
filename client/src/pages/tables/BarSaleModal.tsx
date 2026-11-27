import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Result,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Typography,
} from 'antd';
import {
  CoffeeOutlined,
  DeleteOutlined,
  MinusOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, isNetworkError, ordersApi, productsApi } from '../../api';
import { MoneyText } from '../../components/ui';
import { useAppSettings, useCurrency } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { useEntitlements } from '../../hooks/useEntitlements';
import {
  customerLabel,
  customerMatches,
  loadCustomerDirectory,
  type CustomerDirectory,
} from '../../offline/customer-directory';
import { newActionKey, queueBarSale } from '../../offline/pos';
import { TOKENS } from '../../theme/tokens';
import type { BarSaleResult, Customer, PaymentMethod, Product } from '../../types';
import {
  BAR_SALE_MAX_LINES,
  BAR_SALE_MAX_QUANTITY,
  addToCart,
  barSalePayments,
  barSaleTotals,
  buildBarSalePayload,
  setCartQuantity,
  type BarCartLine,
  type BarPayMode,
} from '../../utils/barSale';
import { formatMoney, moneyFormatter, moneyParser } from '../../utils/format';
import { printHtml } from '../../utils/print';
import { RECEIPT_CSS, RECEIPT_FONTS, renderCheckoutReceipt } from '../../utils/receipt';
import '../../styles/tables-workspace.css';
import '../../styles/bar-sale.css';

const { Text } = Typography;

/** O'lchov birliklari — OrderModal / Products sahifasidagi UNITS bilan bir xil */
const UNITS = ['dona', 'paket', 'piyola', 'litr'] as const;
const unitLabel = (unit: string, t: (key: string) => string): string =>
  (UNITS as readonly string[]).includes(unit) ? t(`products.unit_${unit}`) : unit;

const PAY_MODES: BarPayMode[] = ['cash', 'card', 'transfer', 'mixed'];

/** Server 409 (narx o'zgargan) qaytardimi */
const isConflict = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 409;

interface DirectoryState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  data: CustomerDirectory | null;
}

interface SaleDone {
  data: BarSaleResult;
  /** Internetsiz saqlangan — aloqa tiklanganda yuboriladi */
  offline: boolean;
}

interface BarSaleModalProps {
  open: boolean;
  onClose: () => void;
  /** Savdo yozildi (ro'yxat/statistika yangilansin) */
  onSold?: () => void;
  /** Server soati bilan farq (ms) — oflayn savdo vaqti shu soatdan olinadi */
  offsetMs?: number;
}

/**
 * STOLSIZ BAR SAVDOSI — billiard o'ynamaydigan mijozga bardan to'g'ridan-to'g'ri sotish.
 *
 * Chapda — mahsulotlar katalogi (stol bar oynasi bilan bir xil ko'rinish), o'ngda —
 * savat va to'lov: chegirma, usul (naqd / karta / o'tkazma / aralash), ixtiyoriy
 * mijoz va qarzga yozish. To'lovdan keyin natija va chek (80 mm, "Bar cheki").
 *
 * Internet bo'lmasa (yoki aynan shu so'rovda uzilsa) savdo navbatga tushadi — pul
 * kassada olingan, server uni o'sha vaqt va narx bilan yozadi (offline/pos.ts:
 * queueBarSale). Internetsiz qarz — faqat «Mijozlar» ro'yxatidagi mijozga.
 */
const BarSaleModal = ({ open, onClose, onSold, offsetMs = 0 }: BarSaleModalProps) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const currency = useCurrency();
  const { user, club } = useAuth();
  const { clubAddress } = useAppSettings();
  const { online } = useConnection();
  const { can } = useEntitlements();
  const canDebts = can('debts');
  const canCustomers = can('customers');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | 'all'>('all');
  const [cart, setCart] = useState<BarCartLine[]>([]);
  const [discount, setDiscount] = useState<number | null>(null);
  const [mode, setMode] = useState<BarPayMode>('cash');
  const [cashPart, setCashPart] = useState<number | null>(null);
  const [isDebt, setIsDebt] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<SaleDone | null>(null);
  const [directory, setDirectory] = useState<DirectoryState>({ status: 'idle', data: null });
  const loadRef = useRef(0);

  const loadProducts = useCallback(async () => {
    const request = ++loadRef.current;
    setLoading(true);
    try {
      const res = await productsApi.list({ limit: 500 });
      if (request === loadRef.current) setProducts(res.data);
    } catch (err) {
      if (request === loadRef.current) message.error(errorMessage(err, t('common.error')));
    } finally {
      if (request === loadRef.current) setLoading(false);
    }
  }, [message, t]);

  const reset = useCallback(() => {
    setSearch('');
    setCategory('all');
    setCart([]);
    setDiscount(null);
    setMode('cash');
    setCashPart(null);
    setIsDebt(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(undefined);
    setDone(null);
  }, []);

  // Har ochilishda — toza savat va yangi katalog (ombor qoldig'i aktual)
  useEffect(() => {
    if (!open) return;
    reset();
    void loadProducts();
  }, [open, reset, loadProducts]);

  // Internetsiz qarz uchun — shu kassada saqlangan «Mijozlar» ro'yxati
  const needDirectory = open && !online && canDebts && canCustomers;
  useEffect(() => {
    if (!needDirectory || directory.status !== 'idle') return;
    let alive = true;
    setDirectory({ status: 'loading', data: null });
    loadCustomerDirectory()
      .then((data) => {
        if (alive) setDirectory({ status: 'ready', data });
      })
      .catch(() => {
        if (alive) setDirectory({ status: 'unavailable', data: null });
      });
    return () => {
      alive = false;
    };
  }, [needDirectory, directory.status]);

  const active = useMemo(() => products.filter((p) => p.isActive), [products]);
  const productById = useMemo(() => new Map(active.map((p) => [p.id, p])), [active]);
  const categories = useMemo(
    () =>
      Array.from(
        new Map(active.map((p) => [p.categoryId, p.category?.name || t('tables.otherProducts')])).entries(),
      ),
    [active, t],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return active.filter(
      (p) => (category === 'all' || p.categoryId === category) && p.name.toLocaleLowerCase().includes(q),
    );
  }, [active, category, search]);

  const totals = barSaleTotals(cart, active, discount);
  const payments = barSalePayments(mode, totals.toPay, cashPart);
  const customerById = useMemo(
    () => new Map<number, Customer>((directory.data?.customers ?? []).map((c) => [c.id, c])),
    [directory.data],
  );

  /** Internetsiz qarz mumkin emasligi sababi (bo'lmasa null) */
  const offlineDebtBlock: string | null = online
    ? null
    : !canCustomers
      ? t('offline.debtNeedsCustomersFeature')
      : directory.status === 'unavailable'
        ? t('offline.debtNoCustomerCache')
        : null;

  const debtCustomerReady = online ? customerName.trim() !== '' : customerId !== undefined;
  const canSubmit =
    !submitting &&
    !loading &&
    totals.count > 0 &&
    (isDebt ? debtCustomerReady && (online || offlineDebtBlock === null) : payments !== null);

  const startNew = () => {
    reset();
    void loadProducts();
  };

  /** Internetsiz savdo natijasi — chek va ekran uchun (server ID si hali yo'q) */
  const localResult = (soldAtMs: number, debt: number): BarSaleResult => {
    const items = cart
      .map((line) => {
        const product = productById.get(line.productId);
        if (!product) return null;
        return {
          productId: product.id,
          name: product.name,
          quantity: line.quantity,
          price: product.price,
          subtotal: Math.round(product.price * line.quantity * 100) / 100,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
    const listed = customerId !== undefined ? customerById.get(customerId) : undefined;
    return {
      orderId: 0,
      saleId: 0,
      items,
      barAmount: totals.gross,
      discount: totals.discount,
      totalAmount: totals.toPay,
      paidNow: debt > 0 ? 0 : totals.toPay,
      payments: debt > 0 ? [] : (payments ?? []),
      totalDebt: debt,
      debtId: null,
      customerId: listed?.id ?? null,
      customerName: listed?.name ?? (customerName.trim() || null),
      soldAt: new Date(soldAtMs).toISOString(),
      serverNow: new Date(soldAtMs).toISOString(),
    };
  };

  const saveOffline = async (key: string) => {
    const listed = customerId !== undefined ? customerById.get(customerId) : undefined;
    const payload = buildBarSalePayload({
      cart,
      products: active,
      discount,
      mode,
      cashPart,
      isDebt,
      customer: isDebt
        ? { customerId: listed?.id, customerName: listed?.name, customerPhone: listed?.phone }
        : { customerName, customerPhone },
    });
    if (!payload) return false;
    if (payload.isDebt && !payload.customerId) {
      message.warning(t('offline.debtPickCustomer'));
      return true;
    }
    const soldAtMs = Date.now() + offsetMs;
    const debt = payload.isDebt ? totals.toPay : 0;
    await queueBarSale(payload, totals.toPay, key, soldAtMs, debt);
    setDone({ data: localResult(soldAtMs, debt), offline: true });
    message.success(t('offline.savedOffline'));
    onSold?.();
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    // Bir martalik kalit — onlayn urinish va navbatdagi takror uchun BIR XIL
    const key = newActionKey();
    setSubmitting(true);
    try {
      if (!online) {
        await saveOffline(key);
        return;
      }
      const payload = buildBarSalePayload({
        cart,
        products: active,
        discount,
        mode,
        cashPart,
        isDebt,
        customer: { customerName, customerPhone },
      });
      if (!payload) return;
      try {
        const res = await ordersApi.sell(payload, key);
        setDone({ data: res.data, offline: false });
        message.success(res.message);
        onSold?.();
      } catch (err) {
        // Aloqa aynan shu so'rovda uzildi — savdo yo'qolmasin, o'sha kalit bilan navbatga
        if (isNetworkError(err) && !isDebt) {
          if (await saveOffline(key)) return;
        }
        // Narx boshqa kassada o'zgargan — katalog yangilanadi, kassir yangi summani ko'radi
        if (isConflict(err)) void loadProducts();
        message.error(errorMessage(err, t('common.error')));
      }
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!done) return;
    const sale = done.data;
    const number = sale.orderId > 0 ? sale.orderId : null;
    const html = renderCheckoutReceipt(
      {
        kind: 'bar',
        club: { name: club?.name ?? '', address: clubAddress },
        number,
        table: null,
        startedAt: null,
        endedAt: sale.soldAt,
        durationSeconds: 0,
        cashier: user?.name ?? null,
        customer: sale.customerName,
        segments: null,
        tableAmount: 0,
        barLines: sale.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        })),
        barAmount: sale.barAmount,
        discount: sale.discount,
        adjustment: null,
        total: sale.totalAmount,
        paidNow: sale.paidNow,
        payments: sale.payments,
        debt: sale.totalDebt,
        offline: done.offline,
      },
      t,
      currency,
    );
    printHtml(number ? `${t('tables.rcptBarTitle')} #${number}` : t('tables.rcptBarTitle'), html, {
      css: RECEIPT_CSS,
      fonts: RECEIPT_FONTS,
      lang: i18n.language,
    });
  };

  const payLabel = (value: BarPayMode): string =>
    value === 'mixed' ? t('orders.payMixed') : t(`payment.${value as PaymentMethod}`);

  /* ------------------------------------------------------------ natija */
  const renderDone = (sale: SaleDone) => (
    <div className="bar-sale-done">
      <Result
        status="success"
        title={t(sale.data.totalDebt > 0 ? 'orders.saleDoneDebt' : 'orders.saleDone')}
        subTitle={sale.offline ? t('offline.checkoutOfflineReceipt') : undefined}
      />
      <dl className="bar-sale-done__summary">
        {sale.data.items.map((item) => (
          <div key={item.productId}>
            <dt>
              {item.name} × {item.quantity}
            </dt>
            <dd className="tabular-nums">{formatMoney(item.subtotal, currency)}</dd>
          </div>
        ))}
        {sale.data.discount > 0 && (
          <div>
            <dt>{t('common.discount')}</dt>
            <dd className="tabular-nums">−{formatMoney(sale.data.discount, currency)}</dd>
          </div>
        )}
        <div className="is-total">
          <dt>{t('orders.saleTotal')}</dt>
          <dd>
            <MoneyText amount={sale.data.totalAmount} currency={currency} size="lg" />
          </dd>
        </div>
        {sale.data.payments.map((p) => (
          <div key={p.method}>
            <dt>{t(`payment.${p.method}`)}</dt>
            <dd className="tabular-nums">{formatMoney(p.amount, currency)}</dd>
          </div>
        ))}
        {sale.data.totalDebt > 0 && (
          <div>
            <dt>
              {t('tables.debtAmount')}
              {sale.data.customerName ? ` · ${sale.data.customerName}` : ''}
            </dt>
            <dd className="tabular-nums">{formatMoney(sale.data.totalDebt, currency)}</dd>
          </div>
        )}
      </dl>
    </div>
  );

  /* ------------------------------------------------------------ to'lov qismi */
  const checkout = (
    <section className="bar-sale-checkout" aria-label={t('orders.salePayment')}>
      <div className="bar-sale-field">
        <label htmlFor="bar-sale-discount">{t('common.discount')}</label>
        <InputNumber<number>
          id="bar-sale-discount"
          min={0}
          max={totals.gross}
          value={discount}
          onChange={(value) => setDiscount(value ?? null)}
          formatter={moneyFormatter}
          parser={moneyParser as (value?: string) => number}
          addonAfter={currency}
          style={{ width: '100%' }}
          disabled={submitting || totals.gross === 0}
          placeholder="0"
        />
      </div>

      {!isDebt && (
        <div className="bar-sale-field">
          <span className="bar-sale-field__label">{t('orders.salePayment')}</span>
          <Segmented<BarPayMode>
            block
            value={mode}
            onChange={(value) => setMode(value)}
            options={PAY_MODES.map((value) => ({ value, label: payLabel(value) }))}
            disabled={submitting}
          />
          {mode === 'mixed' && (
            <div className="bar-sale-mixed">
              <InputNumber<number>
                min={0}
                max={totals.toPay}
                value={cashPart}
                onChange={(value) => setCashPart(value ?? null)}
                formatter={moneyFormatter}
                parser={moneyParser as (value?: string) => number}
                addonBefore={t('payment.cash')}
                aria-label={t('payment.cash')}
                style={{ width: '100%' }}
                status={payments === null ? 'error' : undefined}
                disabled={submitting}
              />
              <Text type="secondary" className="tabular-nums">
                {t('payment.card')}: {formatMoney(Math.max(0, totals.toPay - (Number(cashPart) || 0)), currency)}
              </Text>
            </div>
          )}
        </div>
      )}

      {canDebts && (
        <div className="bar-sale-field bar-sale-field--inline">
          <span className="bar-sale-field__label">{t('orders.saleDebt')}</span>
          <Switch
            checked={isDebt}
            onChange={setIsDebt}
            aria-label={t('orders.saleDebt')}
            disabled={submitting || (!online && offlineDebtBlock !== null && !isDebt)}
            checkedChildren={t('status.debt')}
            unCheckedChildren={t('status.paid')}
          />
        </div>
      )}
      {canDebts && !online && (
        <Text type="secondary" className="bar-sale-hint">
          {offlineDebtBlock ?? t('offline.debtOfflineHint')}
        </Text>
      )}

      {isDebt && !online ? (
        <div className="bar-sale-field">
          <label htmlFor="bar-sale-debtor">{t('offline.debtCustomer')}</label>
          <Select<number>
            id="bar-sale-debtor"
            showSearch
            allowClear
            value={customerId}
            loading={directory.status === 'loading'}
            placeholder={t('offline.debtCustomerPlaceholder')}
            options={(directory.data?.customers ?? []).map((c) => ({ value: c.id, label: customerLabel(c) }))}
            filterOption={(input, option) => {
              const customer = option ? customerById.get(Number(option.value)) : undefined;
              return customer ? customerMatches(customer, input) : false;
            }}
            onChange={(id?: number) => setCustomerId(id)}
            notFoundContent={
              directory.status === 'loading' ? null : (
                <Text type="secondary" style={{ whiteSpace: 'normal', fontSize: 12.5 }}>
                  {t('offline.debtCustomerNotListed')}
                </Text>
              )
            }
            disabled={submitting}
          />
        </div>
      ) : (
        <div className="bar-sale-customer">
          <div className="bar-sale-field">
            <label htmlFor="bar-sale-customer">
              {isDebt ? t('tables.customerName') : t('orders.saleCustomerOptional')}
            </label>
            <Input
              id="bar-sale-customer"
              value={customerName}
              maxLength={100}
              onChange={(e) => setCustomerName(e.target.value)}
              status={isDebt && !customerName.trim() ? 'warning' : undefined}
              disabled={submitting}
            />
          </div>
          <div className="bar-sale-field">
            <label htmlFor="bar-sale-phone">{t('common.phone')}</label>
            <Input
              id="bar-sale-phone"
              value={customerPhone}
              maxLength={20}
              placeholder="+998"
              onChange={(e) => setCustomerPhone(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
      )}
    </section>
  );

  /* ------------------------------------------------------------ oyna */
  return (
    <Modal
      title={
        <span>
          <ShoppingOutlined style={{ color: TOKENS.color.emerald.glow, marginRight: 8 }} />
          {t('orders.saleTitle')}
        </span>
      }
      open={open}
      onCancel={() => {
        if (!submitting) onClose();
      }}
      className="table-pos-modal bar-sale-modal"
      width="min(1080px, calc(100vw - 24px))"
      centered
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      destroyOnHidden
      footer={
        done ? (
          <div className="bar-sale-done__actions">
            <Button icon={<PrinterOutlined />} size="large" onClick={handlePrint}>
              {t('tables.printReceipt')}
            </Button>
            <Button size="large" icon={<PlusOutlined />} onClick={startNew}>
              {t('orders.saleNew')}
            </Button>
            <Button size="large" type="primary" onClick={onClose}>
              {t('btn.close')}
            </Button>
          </div>
        ) : (
          <div className="table-pos-footer">
            <div>
              <span>
                {t('orders.saleToPay')} · {t('tables.basketItems', { n: totals.count })}
              </span>
              <MoneyText amount={totals.toPay} currency={currency} size="lg" color={TOKENS.color.text.primary} />
            </div>
            <Button
              type="primary"
              size="large"
              icon={<ShoppingCartOutlined />}
              loading={submitting}
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {isDebt ? t('orders.saleSubmitDebt') : t('orders.saleSubmit')}
            </Button>
          </div>
        )
      }
    >
      {done ? (
        renderDone(done)
      ) : (
        <div className="table-pos-layout">
          <section className="table-pos-catalog" aria-label={t('tables.productCatalog')}>
            {!online && <Alert type="warning" showIcon message={t('orders.saleOfflineNote')} style={{ marginBottom: 10 }} />}
            <Input
              prefix={<SearchOutlined />}
              placeholder={t('tables.searchProducts')}
              aria-label={t('tables.searchProducts')}
              value={search}
              allowClear
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="table-pos-categories" role="group" aria-label={t('tables.productCategories')}>
              <button
                type="button"
                className={category === 'all' ? 'is-selected' : ''}
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                {t('tables.view_all')}
              </button>
              {categories.map(([id, name]) => (
                <button
                  type="button"
                  key={id}
                  className={category === id ? 'is-selected' : ''}
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : visible.length ? (
              <div className="table-pos-products">
                {visible.map((product) => {
                  const quantity = cart.find((line) => line.productId === product.id)?.quantity ?? 0;
                  return (
                    <button
                      type="button"
                      key={product.id}
                      className={`table-pos-product${quantity ? ' is-in-basket' : ''}`}
                      onClick={() => setCart((prev) => addToCart(prev, product.id))}
                      disabled={
                        submitting ||
                        quantity >= BAR_SALE_MAX_QUANTITY ||
                        (cart.length >= BAR_SALE_MAX_LINES && quantity === 0)
                      }
                      aria-label={t('tables.addProduct', { name: product.name })}
                    >
                      <span className="table-pos-product__top">
                        <CoffeeOutlined />
                        {quantity > 0 ? <b>{quantity}</b> : <PlusOutlined />}
                      </span>
                      <strong>{product.name}</strong>
                      <span className="table-pos-product__price">{formatMoney(product.price, currency)}</span>
                      <span className={`table-pos-product__stock${product.stock <= 0 ? ' is-empty' : ''}`}>
                        {product.stock <= 0 ? t('tables.outOfStock') : `${product.stock} ${unitLabel(product.unit, t)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tables.noMatchingProducts')} />
            )}
          </section>

          <aside className="table-pos-basket" aria-label={t('tables.basket')}>
            <div className="table-pos-basket__header">
              <h3>
                <ShoppingCartOutlined />
                {t('tables.basket')}
              </h3>
              <span>{t('tables.basketItems', { n: totals.count })}</span>
            </div>
            {cart.length === 0 ? (
              <p className="table-pos-basket__empty">{t('orders.saleEmptyBasket')}</p>
            ) : (
              <ul className="bar-sale-lines">
                {cart.map((line) => {
                  const product = productById.get(line.productId);
                  if (!product) return null;
                  return (
                    <li key={line.productId} className="bar-sale-line">
                      <div className="bar-sale-line__info">
                        <strong>{product.name}</strong>
                        <Text type="secondary" className="tabular-nums">
                          {formatMoney(product.price, currency)} × {line.quantity} ={' '}
                          {formatMoney(product.price * line.quantity, currency)}
                        </Text>
                      </div>
                      <div className="bar-sale-line__qty">
                        <Button
                          icon={<MinusOutlined />}
                          aria-label={t('orders.saleDecrease', { name: product.name })}
                          onClick={() => setCart((prev) => setCartQuantity(prev, line.productId, line.quantity - 1))}
                          disabled={submitting}
                        />
                        <InputNumber<number>
                          min={1}
                          max={BAR_SALE_MAX_QUANTITY}
                          precision={0}
                          value={line.quantity}
                          aria-label={t('common.quantity')}
                          onChange={(value) =>
                            setCart((prev) => setCartQuantity(prev, line.productId, value ?? 0))
                          }
                          disabled={submitting}
                        />
                        <Button
                          icon={<PlusOutlined />}
                          aria-label={t('tables.addProduct', { name: product.name })}
                          onClick={() => setCart((prev) => addToCart(prev, line.productId))}
                          disabled={submitting || line.quantity >= BAR_SALE_MAX_QUANTITY}
                        />
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={t('btn.delete')}
                          onClick={() => setCart((prev) => setCartQuantity(prev, line.productId, 0))}
                          disabled={submitting}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {cart.length > 0 && checkout}
          </aside>
        </div>
      )}
    </Modal>
  );
};

export default BarSaleModal;
