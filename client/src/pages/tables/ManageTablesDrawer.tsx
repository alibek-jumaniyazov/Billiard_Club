import { useEffect, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, tablesApi } from '../../api';
import { EmptyState, MoneyText, StatusTag } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable } from '../../types';
import { moneyFormatter, moneyParser } from './money';

const { Text } = Typography;

interface TableFormValues {
  name: string;
  number: number;
  pricePerHour: number;
  description?: string;
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; table: BilliardTable };

interface ManageTablesDrawerProps {
  open: boolean;
  /** true — ochilganda darhol "qo'shish" formasi (birinchi stol CTA) */
  startWithCreate?: boolean;
  tables: BilliardTable[];
  onClose: () => void;
  /** Har qanday CRUD muvaffaqiyatidan keyin (sahifa qayta yuklaydi) */
  onChanged: () => void;
}

/**
 * Stollarni boshqarish (faqat admin): ro'yxat + yaratish/tahrirlash/
 * faolsizlantirish. Yangi klub uchun stol qo'shishning YAGONA yo'li.
 */
const ManageTablesDrawer = ({
  open,
  startWithCreate = false,
  tables,
  onClose,
  onChanged,
}: ManageTablesDrawerProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<TableFormValues>();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [submitting, setSubmitting] = useState(false);
  const currency = t('common.sum');

  useEffect(() => {
    if (!open) return;
    setMode(startWithCreate ? { kind: 'create' } : { kind: 'list' });
    form.resetFields();
  }, [open, startWithCreate, form]);

  const openCreate = () => {
    form.resetFields();
    // Keyingi bo'sh raqamni taklif qilamiz
    const nextNumber = tables.reduce((max, tbl) => Math.max(max, tbl.number), 0) + 1;
    form.setFieldsValue({ number: nextNumber });
    setMode({ kind: 'create' });
  };

  const openEdit = (table: BilliardTable) => {
    form.setFieldsValue({
      name: table.name,
      number: table.number,
      pricePerHour: table.pricePerHour,
      description: table.description ?? '',
    });
    setMode({ kind: 'edit', table });
  };

  const backToList = () => {
    form.resetFields();
    setMode({ kind: 'list' });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const body = {
        name: values.name.trim(),
        number: values.number,
        pricePerHour: values.pricePerHour,
        description: values.description?.trim() || undefined,
      };
      const res =
        mode.kind === 'edit'
          ? await tablesApi.update(mode.table.id, body)
          : await tablesApi.create(body);
      message.success(res.message);
      onChanged();
      backToList();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (table: BilliardTable) => {
    try {
      const res = await tablesApi.remove(table.id);
      message.success(res.message);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const isForm = mode.kind !== 'list';

  return (
    <Drawer
      title={
        isForm ? (
          <span>
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={backToList}
              aria-label={t('btn.back')}
              style={{ marginRight: 8 }}
            />
            {mode.kind === 'edit' ? t('tables.editTable') : t('tables.addTable')}
          </span>
        ) : (
          t('tables.manageTitle')
        )
      }
      open={open}
      onClose={onClose}
      width="min(480px, 100vw)"
      destroyOnHidden
      footer={
        isForm ? (
          <Button
            type="primary"
            block
            loading={submitting}
            onClick={() => void handleSubmit()}
            icon={mode.kind === 'edit' ? <EditOutlined /> : <PlusOutlined />}
          >
            {mode.kind === 'edit' ? t('btn.save') : t('btn.add')}
          </Button>
        ) : (
          <Button type="primary" block icon={<PlusOutlined />} onClick={openCreate}>
            {t('tables.addTable')}
          </Button>
        )
      }
    >
      {isForm ? (
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t('tables.tableName')}
            rules={[{ required: true, whitespace: true, message: t('tables.tableNameRequired') }]}
          >
            <Input maxLength={100} autoFocus placeholder="VIP-1" />
          </Form.Item>
          <Form.Item
            name="number"
            label={t('tables.tableNumber')}
            rules={[{ required: true, message: t('tables.tableNumberRequired') }]}
          >
            <InputNumber min={1} max={999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="pricePerHour"
            label={`${t('tables.tablePrice')} (${currency})`}
            rules={[{ required: true, message: t('tables.tablePriceRequired') }]}
          >
            <InputNumber
              min={0}
              step={5000}
              style={{ width: '100%' }}
              formatter={moneyFormatter}
              parser={moneyParser}
            />
          </Form.Item>
          <Form.Item name="description" label={t('tables.tableDescriptionOptional')}>
            <Input.TextArea maxLength={500} rows={2} />
          </Form.Item>
        </Form>
      ) : tables.length === 0 ? (
        <EmptyState icon={<TableOutlined />} title={t('tables.manageEmpty')} hint={t('tables.noTablesHint')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tables.map((table) => {
            const busy = table.status === 'busy';
            return (
              <div
                key={table.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: TOKENS.color.bg.bg1,
                  border: `1px solid ${TOKENS.color.border.subtle}`,
                  borderRadius: TOKENS.radius.md,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: TOKENS.radius.sm,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: TOKENS.color.gold.base,
                    background: TOKENS.color.gold.subtle,
                    border: `1px solid ${TOKENS.color.gold.line}`,
                  }}
                  className="tabular-nums"
                >
                  {table.number}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text strong ellipsis style={{ display: 'block' }}>
                    {table.name}
                  </Text>
                  <MoneyText
                    amount={table.pricePerHour}
                    currency={`${currency} / ${t('tables.perHour')}`}
                    size="sm"
                    color={TOKENS.color.text.secondary}
                  />
                </div>
                <StatusTag
                  status={busy ? 'busy' : 'free'}
                  label={busy ? t('status.busy') : t('status.free')}
                />
                <Tooltip title={t('btn.edit')}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(table)}
                    aria-label={t('btn.edit')}
                  />
                </Tooltip>
                <Popconfirm
                  title={t('tables.deactivateConfirmTitle')}
                  description={t('tables.deactivateConfirmDesc')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  okButtonProps={{ danger: true }}
                  disabled={busy}
                  onConfirm={() => void handleDeactivate(table)}
                >
                  <Tooltip title={busy ? t('tables.deactivateBusy') : t('tables.deactivate')}>
                    <Button
                      type="text"
                      danger
                      disabled={busy}
                      icon={<DeleteOutlined />}
                      aria-label={t('tables.deactivate')}
                    />
                  </Tooltip>
                </Popconfirm>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
};

export default ManageTablesDrawer;
