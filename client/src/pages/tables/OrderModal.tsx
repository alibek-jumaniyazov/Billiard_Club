import { useEffect, useMemo, useState } from 'react';
import { App, Button, Col, Divider, Form, InputNumber, Modal, Row, Select, Typography } from 'antd';
import { CoffeeOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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

  const session = table?.sessions?.[0] ?? null;
  const items = Form.useWatch('items', form);
  const currency = useCurrency();
  const { online } = useConnection();

  useEffect(() => {
    if (!table) return;
    form.resetFields();
    form.setFieldsValue({ items: [{ productId: undefined, quantity: 1 }] });
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
          label: `${p.name} · ${formatMoney(p.price, currency)} · ${p.stock} ${unitLabel(p.unit, t)}`,
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
      onOk={() => void handleOk()}
      confirmLoading={submitting}
      okText={t('tables.submitOrder')}
      cancelText={t('btn.cancel')}
      width="min(600px, calc(100vw - 32px))"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...rest }) => (
                <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                  <Col flex="auto" style={{ minWidth: 0 }}>
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
                  </Col>
                  <Col flex="90px">
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
                      />
                    </Form.Item>
                  </Col>
                  <Col flex="40px">
                    <Button
                      danger
                      block
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      aria-label={t('btn.delete')}
                    />
                  </Col>
                </Row>
              ))}
              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  disabled={fields.length >= MAX_ITEMS}
                  onClick={() => add({ quantity: 1 })}
                >
                  {t('tables.addRow')}
                </Button>
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
      <Divider style={{ margin: '16px 0 12px' }} />
      <div style={{ textAlign: 'right' }}>
        <Text type="secondary">{t('tables.orderTotal')}: </Text>
        <MoneyText amount={orderTotal} currency={currency} size="lg" color={TOKENS.color.gold.base} />
      </div>
    </Modal>
  );
};

export default OrderModal;
