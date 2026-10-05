import { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Form, Input, InputNumber, Modal, Select, Skeleton, Typography } from 'antd';
import { CoffeeOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, isNetworkError, ordersApi, productsApi } from '../../api';
import { MoneyText } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { useConnection } from '../../context/ConnectionContext';
import { newActionKey, queueOrder } from '../../offline/pos';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Product } from '../../types';
import { formatMoney } from '../../utils/format';
import { isFormValidationError } from '../../utils/formErrors';

const { Text } = Typography;

/**
 * Bitta so'rovdagi pozitsiyalar chegarasi — server CreateOrderDto dagi
 * @ArrayMaxSize(50) bilan bir xil. Haqiqiy nazorat serverda: bu yerda faqat
 * foydalanuvchi butun buyurtmani yozib bo'lib, umumiy validatsiya xatosiga
 * urilib qolmasligi uchun oldindan to'xtatamiz.
 */
const MAX_ITEMS = 50;

/**
 * O'lchov birliklari — DB da til-neytral kalit sifatida saqlanadi
 * ('dona', 'paket', ...), ekranda esa tarjima qilinadi. Ro'yxat Products
 * sahifasidagi UNITS bilan bir xil bo'lishi kerak.
 */
const UNITS = ['dona', 'paket', 'piyola', 'litr'] as const;

/** Birlik kalitini tarjimaga aylantiradi; notanish qiymat o'z holicha qoladi */
const unitLabel = (unit: string, t: (key: string) => string): string =>
  (UNITS as readonly string[]).includes(unit) ? t(`products.unit_${unit}`) : unit;

interface OrderRow {
  productId?: number;
  quantity?: number;
}

interface OrderValues {
  items: OrderRow[];
}

interface OrderModalProps {
  /** Band stol — null bo'lsa modal yopiq */
  table: BilliardTable | null;
  onClose: () => void;
  /** Buyurtma qo'shilgach (stollar qayta yuklanadi) */
  onOrdered: () => void;
}

/** Bar buyurtmasi — mahsulotlar modal ochilganda yangilanadi (ombor aktual) */
const OrderModal = ({ table, onClose, onOrdered }: OrderModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<OrderValues>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | 'all'>('all');

  const session = table?.sessions?.[0] ?? null;
  const items = Form.useWatch('items', form);
  const currency = useCurrency();
  const { online } = useConnection();

  useEffect(() => {
    if (!table) return;
    form.resetFields();
    form.setFieldsValue({ items: [] });
    setSearch('');
    setCategory('all');
    setProducts([]);
    let alive = true;
    setLoading(true);
    productsApi
      .list({ limit: 500 })
      .then((res) => {
        if (alive) setProducts(res.data);
      })
      .catch((err) => {
        if (alive) message.error(errorMessage(err, t('common.error')));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [table, form, message, t]);

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.isActive)
        .map((p) => ({
          value: p.id,
          // Tugagan mahsulot label'da belgilanadi (server ombor bo'yicha yakuniy
          // hakam — bu faqat vizual ishora, tanlash taqiqlanmaydi). Label matn
          // bo'lib qoladi, aks holda qidiruv (filterOption) buzilardi.
          label: `${p.name} · ${formatMoney(p.price, currency)} · ${p.stock} ${unitLabel(p.unit, t)}${
            p.stock <= 0 ? ` · ${t('tables.outOfStock')}` : ''
          }`,
        })),
    [products, currency, t],
  );

  const orderTotal = useMemo(() => {
    if (!items) return 0;
    return items.reduce((acc, row) => {
      if (!row?.productId || !row?.quantity) return acc;
      const product = products.find((p) => p.id === row.productId);
      return acc + (product ? product.price * row.quantity : 0);
    }, 0);
  }, [items, products]);

  const categories = useMemo(() => Array.from(new Map(products.filter((p) => p.isActive)
    .map((p) => [p.categoryId, p.category?.name || t('tables.otherProducts')])).entries()), [products, t]);
  const visibleProducts = useMemo(() => products.filter((p) => p.isActive
    && (category === 'all' || p.categoryId === category)
    && p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [products, category, search]);
  const itemCount = (items ?? []).reduce((sum, row) => sum + (row?.quantity || 0), 0);
  const addProduct = (product: Product) => {
    const rows: OrderRow[] = form.getFieldValue('items') ?? [];
    const index = rows.findIndex((row) => row.productId === product.id);
    if (index >= 0) {
      form.setFieldValue('items', rows.map((row, i) => i === index
        ? { ...row, quantity: Math.min(1000, (row.quantity || 0) + 1) } : row));
    } else if (rows.length < MAX_ITEMS) {
      form.setFieldValue('items', [...rows, { productId: product.id, quantity: 1 }]);
    }
  };

  const handleOk = async () => {
    if (!session || !table) return;
    setSubmitting(true);
    // Bir martalik kalit — onlayn urinish va navbatdagi takror uchun BIR XIL
    // (takroriy so'rov ikkinchi buyurtma yozib, bar summasini ikkilantirmasin)
    const key = newActionKey();
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = await form.validateFields();
      const rows = (values.items ?? [])
        .filter((row): row is { productId: number; quantity: number } =>
          Boolean(row?.productId && row?.quantity),
        )
        // Miqdor har doim butun son (DTO @IsInt) — kasr qiymat kesib tashlanadi
        .map((row) => ({ productId: row.productId, quantity: Math.trunc(row.quantity) }))
        .filter((row) => row.quantity >= 1);
      if (rows.length === 0) {
        message.warning(t('tables.noItems'));
        return;
      }

      /**
       * NAVBATGA ikki holatda tushadi:
       *  1. internet yo'q — buyurtma mavjud summani O'ZGARTIRMAYDI, faqat
       *     qo'shadi, shuning uchun eskirgan ma'lumot ustida xavfsiz;
       *  2. sessiya hali serverda YO'Q (oflayn boshlangan) — uning `id` si
       *     manfiy sintetik qiymat, uni yuborish xato berardi. Navbat buyurtmani
       *     sessiya yaratilgandan KEYIN yuboradi ($local havolasi).
       */
      if (!online || session.offlineLocalId) {
        await queueOrder(table, session, rows, orderTotal, key);
        message.success(t('offline.savedOffline'));
        onOrdered();
        onClose();
        return;
      }

      const res = await ordersApi.create({ sessionId: session.id, items: rows }, key);
      message.success(res.message);
      onOrdered();
      onClose();
    } catch (err) {
      if (isFormValidationError(err)) return;
      // Aloqa aynan shu so'rovda uzildi — buyurtma yo'qolmasin, navbatga tushsin
      if (isNetworkError(err) && table) {
        try {
          const rows = (form.getFieldValue('items') as OrderRow[] | undefined) ?? [];
          const items = rows
            .filter((row): row is { productId: number; quantity: number } =>
              Boolean(row?.productId && row?.quantity),
            )
            .map((row) => ({ productId: row.productId, quantity: Math.trunc(row.quantity) }))
            .filter((row) => row.quantity >= 1);
          if (items.length > 0) {
            await queueOrder(table, session, items, orderTotal, key);
            message.success(t('offline.savedOffline'));
            onOrdered();
            onClose();
            return;
          }
        } catch {
          // navbatga ham yozib bo'lmadi — oddiy xato ko'rsatiladi
        }
      }
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <CoffeeOutlined style={{ color: TOKENS.color.emerald.glow, marginRight: 8 }} />
          {t('tables.orderTitle')} — {t('common.table')} {table?.number ?? ''}
        </span>
      }
      open={!!table}
      onCancel={onClose}
      className="table-pos-modal"
      width="min(1040px, calc(100vw - 24px))"
      centered
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      footer={<div className="table-pos-footer">
        <div><span>{t('tables.orderTotal')} · {t('tables.basketItems', { n: itemCount })}</span>
          <MoneyText amount={orderTotal} currency={currency} size="lg" color={TOKENS.color.text.primary} /></div>
        <Button type="primary" size="large" icon={<PlusOutlined />} loading={submitting}
          disabled={itemCount === 0 || loading} onClick={() => void handleOk()}>{t('tables.submitOrder')}</Button>
      </div>}
      destroyOnHidden
    >
      <div className="table-pos-layout">
        <section className="table-pos-catalog" aria-label={t('tables.productCatalog')}>
          <Input prefix={<SearchOutlined />} placeholder={t('tables.searchProducts')} aria-label={t('tables.searchProducts')}
            value={search} allowClear onChange={(event) => setSearch(event.target.value)} />
          <div className="table-pos-categories" role="group" aria-label={t('tables.productCategories')}>
            <button className={category === 'all' ? 'is-selected' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t('tables.view_all')}</button>
            {categories.map(([id, name]) => <button key={id} className={category === id ? 'is-selected' : ''}
              aria-pressed={category === id} onClick={() => setCategory(id)}>{name}</button>)}
          </div>
          {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : visibleProducts.length ? <div className="table-pos-products">
            {visibleProducts.map((product) => {
              const quantity = (items ?? []).find((row) => row.productId === product.id)?.quantity ?? 0;
              return <button key={product.id} className={`table-pos-product${quantity ? ' is-in-basket' : ''}`} onClick={() => addProduct(product)}
                disabled={submitting || quantity >= 1000 || ((items?.length ?? 0) >= MAX_ITEMS && quantity === 0)}
                aria-label={t('tables.addProduct', { name: product.name })}>
                <span className="table-pos-product__top"><CoffeeOutlined />{quantity > 0 ? <b>{quantity}</b> : <PlusOutlined />}</span>
                <strong>{product.name}</strong>
                <span className="table-pos-product__price">{formatMoney(product.price, currency)}</span>
                <span className={`table-pos-product__stock${product.stock <= 0 ? ' is-empty' : ''}`}>
                  {product.stock <= 0 ? t('tables.outOfStock') : `${product.stock} ${unitLabel(product.unit, t)}`}
                </span>
              </button>;
            })}
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tables.noMatchingProducts')} />}
        </section>
        <aside className="table-pos-basket" aria-label={t('tables.basket')}>
          <div className="table-pos-basket__header"><h3><ShoppingCartOutlined />{t('tables.basket')}</h3><span>{t('tables.basketItems', { n: itemCount })}</span></div>
          {itemCount === 0 && <p className="table-pos-basket__empty">{t('tables.emptyBasket')}</p>}
          <Form form={form} layout="vertical" disabled={submitting}>
        <Form.List name="items">
          {(fields, { remove }) => (
            <>
              {fields.map(({ key, name, ...rest }) => (
                <div key={key} className="table-pos-basket-row">
                    <Form.Item
                      {...rest}
                      name={[name, 'productId']}
                      rules={[{ required: true, message: t('tables.productRequired') }]}
                      style={{ margin: 0 }}
                    >
                      <Select
                        showSearch
                        loading={loading}
                        placeholder={t('tables.selectProduct')}
                        options={productOptions}
                        filterOption={(input, option) =>
                          String(option?.label ?? '')
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                  <div className="table-pos-basket-row__quantity">
                    <Form.Item
                      {...rest}
                      name={[name, 'quantity']}
                      rules={[{ required: true, message: t('tables.quantityRequired') }]}
                      style={{ margin: 0 }}
                    >
                      {/*
                        Server @IsInt talab qiladi — precision={0} kasr qismini
                        o'zi kesadi. DIQQAT: bu yerda maxsus parser QO'YILMAYDI —
                        kasr ajratkichini olib tashlaydigan parser "1.5" ni "15"
                        ga aylantirib, mijozdan 10 barobar ko'p pul olardi.
                      */}
                      <InputNumber
                        min={1}
                        max={1000}
                        step={1}
                        precision={0}
                        style={{ width: '100%' }}
                        placeholder={t('common.quantity')}
                        aria-label={t('common.quantity')}
                      />
                    </Form.Item>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      aria-label={t('btn.delete')}
                    />
                  </div>
                  {/* Qator subtotal (narx × miqdor) — chek o'zini-o'zi tekshiradi */}
                  {(() => {
                    const row = items?.[name];
                    const product = row?.productId
                      ? products.find((p) => p.id === row.productId)
                      : null;
                    if (!product || !row?.quantity) return null;
                    return (
                      <div className="table-pos-basket-row__subtotal">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatMoney(product.price * row.quantity, currency)}
                        </Text>
                      </div>
                    );
                  })()}
                </div>
              ))}
              <Form.Item style={{ marginBottom: 0 }}>
                {fields.length >= MAX_ITEMS && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                    {t('tables.maxItemsHint', { max: MAX_ITEMS })}
                  </Text>
                )}
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form>
        </aside>
      </div>
    </Modal>
  );
};

export default OrderModal;
