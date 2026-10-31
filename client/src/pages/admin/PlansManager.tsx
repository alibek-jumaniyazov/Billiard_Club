import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { CreditCardOutlined, EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { adminBillingApi, errorMessage } from '../../api';
import { EmptyState, StatusTag } from '../../components/ui';
import { planPeriodKey } from '../../constants';
import type { Plan, TierCode } from '../../types';
import { formatMoney, formatNumber } from '../../utils/format';
import { TIER_TAG_COLOR, tierLabel, tierOptions } from '../../utils/tiers';

const { Text } = Typography;

/** Ming ajratkichli InputNumber formatlash */
const moneyFormatter = (v: string | number | undefined) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const moneyParser = (v: string | undefined) => (v ?? '').replace(/\s/g, '') as unknown as number;

interface PlanFormValues {
  code: string;
  tier: TierCode;
  nameUz: string;
  nameRu: string;
  descriptionUz?: string;
  descriptionRu?: string;
  durationDays: number;
  price: number;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * TARIF QATORLARI — har bir sotiladigan tarif (daraja × muddat) va maxsus
 * tariflar (masalan 45 kunlik aksiya): yaratish, tahrirlash, sotuvdan olish
 * (yumshoq o'chirish — eski fakturalar bog'liqligicha qoladi).
 *
 * `refreshKey` o'zgarsa ro'yxat qayta olinadi (Tarif darajalari jadvalida
 * narx saqlanganda), `onChanged` — bu yerda o'zgarganda o'sha jadvalga xabar.
 */
const PlansManager = ({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();
  const lang = i18n.language;

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda qayta so'ralmasin
  const tRef = useRef(t);
  tRef.current = t;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planForm] = Form.useForm<PlanFormValues>();

  const planName = (plan: Plan) => (lang === 'ru' ? plan.nameRu : plan.nameUz);

  const periodLabel = (days: number): string => {
    const key = planPeriodKey(days);
    return key === 'custom' ? `${formatNumber(days)} ${t('common.days')}` : t(`admin.billing.period_${key}`);
  };

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await adminBillingApi.plans();
      setPlans(res.data);
    } catch (err) {
      message.error(errorMessage(err, tRef.current('common.error')));
    } finally {
      setPlansLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans, refreshKey]);

  const openPlanModal = (plan: Plan | null) => {
    setEditingPlan(plan);
    if (plan) {
      planForm.setFieldsValue({
        code: plan.code,
        tier: plan.tier ?? 'standard',
        nameUz: plan.nameUz,
        nameRu: plan.nameRu,
        descriptionUz: plan.descriptionUz ?? undefined,
        descriptionRu: plan.descriptionRu ?? undefined,
        durationDays: plan.durationDays,
        price: plan.price,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      });
    } else {
      planForm.resetFields();
      planForm.setFieldsValue({ isActive: true, sortOrder: 0, tier: 'standard' });
    }
    setPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    const values = await planForm.validateFields();
    setPlanSaving(true);
    try {
      const body = {
        code: values.code,
        tier: values.tier,
        nameUz: values.nameUz,
        nameRu: values.nameRu,
        descriptionUz: values.descriptionUz || undefined,
        descriptionRu: values.descriptionRu || undefined,
        durationDays: values.durationDays,
        price: values.price,
        sortOrder: values.sortOrder ?? 0,
        isActive: values.isActive ?? true,
      };
      const res = editingPlan
        ? await adminBillingApi.updatePlan(editingPlan.id, body)
        : await adminBillingApi.createPlan(body);
      message.success(res.message);
      setPlanModalOpen(false);
      void fetchPlans();
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setPlanSaving(false);
    }
  };

  const confirmDeactivatePlan = (plan: Plan) => {
    modal.confirm({
      title: t('admin.billing.deactivateConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await adminBillingApi.deactivatePlan(plan.id);
          message.success(res.message);
          void fetchPlans();
          onChanged?.();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
      },
    });
  };

  const planColumns: ColumnsType<Plan> = [
    {
      title: t('admin.billing.code'),
      dataIndex: 'code',
      width: 130,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('tiers.adminTier'),
      dataIndex: 'tier',
      width: 110,
      render: (tier: TierCode) => <Tag color={TIER_TAG_COLOR[tier]}>{tierLabel(tier, lang)}</Tag>,
    },
    {
      title: t('common.name'),
      key: 'name',
      render: (_, plan) => (
        <Space direction="vertical" size={0}>
          <Text strong>{planName(plan)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {lang === 'ru' ? plan.descriptionRu : plan.descriptionUz}
          </Text>
        </Space>
      ),
    },
    {
      title: t('admin.billing.duration'),
      dataIndex: 'durationDays',
      width: 140,
      render: (days: number) => (
        <Space size={6}>
          <Tag color="gold">{periodLabel(days)}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }} className="tabular-nums">
            {formatNumber(days)} {t('common.days')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.price'),
      dataIndex: 'price',
      width: 150,
      align: 'right',
      render: (price: number) => (
        <Text strong className="tabular-nums">
          {formatMoney(price, t('common.sum'))}
        </Text>
      ),
    },
    {
      title: t('admin.billing.sortOrder'),
      dataIndex: 'sortOrder',
      width: 80,
      align: 'center',
      responsive: ['md'],
    },
    {
      title: t('adminClubs.status'),
      dataIndex: 'isActive',
      width: 110,
      render: (isActive: boolean) => (
        <StatusTag
          status={isActive ? 'success' : 'default'}
          label={isActive ? t('admin.billing.active') : t('admin.billing.inactive')}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 110,
      render: (_, plan) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} aria-label={t('btn.edit')} onClick={() => openPlanModal(plan)} />
          {plan.isActive && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              aria-label={t('admin.billing.deactivate')}
              onClick={() => confirmDeactivatePlan(plan)}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title={t('tiers.plansTab')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanModal(null)}>
            {t('admin.billing.addPlan')}
          </Button>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          {t('tiers.plansHint')}
        </Text>
        <Table
          rowKey="id"
          size="small"
          sticky
          columns={planColumns}
          dataSource={plans}
          loading={plansLoading}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<CreditCardOutlined />}
                title={t('admin.billing.plansEmpty')}
                hint={t('admin.billing.plansEmptyHint')}
                action={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanModal(null)}>
                    {t('admin.billing.addPlan')}
                  </Button>
                }
              />
            ),
          }}
        />
      </Card>

      {/* Tarif yaratish/tahrirlash */}
      <Modal
        title={editingPlan ? t('admin.billing.editPlan') : t('admin.billing.addPlan')}
        open={planModalOpen}
        onCancel={() => setPlanModalOpen(false)}
        onOk={() => void handleSavePlan()}
        confirmLoading={planSaving}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={planForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="code"
                label={t('admin.billing.code')}
                rules={[
                  { required: true, message: t('admin.billing.codeRequired') },
                  { pattern: /^[a-z0-9_-]+$/i, message: 'a-z, 0-9, _ -' },
                ]}
              >
                <Input maxLength={50} placeholder="standard_1m" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="durationDays"
                label={t('admin.billing.durationDays')}
                rules={[{ required: true, message: t('admin.billing.durationRequired') }]}
              >
                <InputNumber min={1} max={3650} style={{ width: '100%' }} placeholder="30" />
              </Form.Item>
            </Col>
          </Row>
          {/* Qaysi daraja sotiladi — to'lov tasdiqlanganda klub shu darajaga o'tadi */}
          <Form.Item name="tier" label={t('tiers.adminTier')} rules={[{ required: true }]}>
            <Select options={tierOptions(lang)} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="nameUz"
                label={t('admin.billing.nameUz')}
                rules={[{ required: true, message: t('admin.billing.nameRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="nameRu"
                label={t('admin.billing.nameRu')}
                rules={[{ required: true, message: t('admin.billing.nameRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="descriptionUz" label={t('admin.billing.descriptionUz')}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="descriptionRu" label={t('admin.billing.descriptionRu')}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="price"
                label={t('common.price')}
                rules={[{ required: true, message: t('admin.billing.priceRequired') }]}
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  step={50000}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="sortOrder" label={t('admin.billing.sortOrder')}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="isActive" label={t('admin.billing.active')} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
};

export default PlansManager;
