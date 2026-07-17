import { useEffect, useMemo, useState } from 'react';
import { App, Button, Col, Divider, Form, InputNumber, Modal, Row, Select, Typography } from 'antd';
import { CoffeeOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, ordersApi, productsApi } from '../../api';
import { MoneyText } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Product } from '../../types';
import { formatMoney } from '../../utils/format';

const { Text } = Typography;

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
  const currency = t('common.sum');

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
          label: `${p.name} · ${formatMoney(p.price, currency)} · ${p.stock} ${p.unit}`,
        })),
    [products, currency],
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
    if (!session) return;
    const values = await form.validateFields();
    const rows = (values.items ?? [])
      .filter((row): row is { productId: number; quantity: number } =>
        Boolean(row?.productId && row?.quantity),
      )
      .map((row) => ({ productId: row.productId, quantity: row.quantity }));
    if (rows.length === 0) {
      message.warning(t('tables.noItems'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await ordersApi.create({ sessionId: session.id, items: rows });
      message.success(res.message);
      onOrdered();
      onClose();
    } catch (err) {
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
                      <InputNumber min={1} style={{ width: '100%' }} placeholder={t('common.quantity')} />
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
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                  {t('tables.addRow')}
                </Button>
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
