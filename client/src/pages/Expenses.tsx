import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  NumberOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, expensesApi } from '../api';
import { EmptyState, MoneyText, PageHeader, PageTransition, StatCard } from '../components/ui';
import { EXPENSE_CATEGORY_SUGGESTIONS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { Expense } from '../types';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Filters {
  range: [Dayjs, Dayjs] | null;
  category: string | null;
}

interface FetchParams extends Filters {
  page: number;
  limit: number;
}

interface ExpenseFormValues {
  category: string;
  amount: number;
  description?: string;
  spentAt?: Dayjs;
}

const Expenses = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState<number | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => [
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [category, setCategory] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ExpenseFormValues>();

  /** Tahrirlash/o'chirish — faqat admin (server PUT/DELETE rollariga mos) */
  const canManage = hasRole('superadmin', 'admin');

  /** Til-neytral toifa kalitini tarjima qiladi; erkin matn o'zicha qoladi */
  const categoryLabel = useCallback(
    (value: string): string =>
      (EXPENSE_CATEGORY_SUGGESTIONS as readonly string[]).includes(value)
        ? t(`expenses.cat.${value}`)
        : value,
    [t],
  );

  const fetchExpenses = useCallback(
    async (params: FetchParams) => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await expensesApi.list({
          page: params.page,
          limit: params.limit,
          from: params.range ? params.range[0].format('YYYY-MM-DD') : undefined,
          to: params.range ? params.range[1].format('YYYY-MM-DD') : undefined,
          category: params.category ?? undefined,
        });
        if (res.data.length === 0 && params.page > 1 && (res.pagination?.total ?? 0) > 0) {
          setPage(params.page - 1);
          return fetchExpenses({ ...params, page: params.page - 1 });
        }
        setExpenses(res.data);
        setTotal(res.pagination?.total ?? 0);
        setSum(res.sum ?? 0);
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
    void fetchExpenses({
      page: 1,
      limit: 20,
      range: [dayjs().startOf('month'), dayjs()],
      category: null,
    });
  }, [fetchExpenses]);

  const refresh = () => void fetchExpenses({ page, limit: pageSize, range, category });

  const applyFilters = (next: Partial<Filters>) => {
    const merged: Filters = {
      range: next.range !== undefined ? next.range : range,
      category: next.category !== undefined ? next.category : category,
    };
    if (next.range !== undefined) setRange(next.range);
    if (next.category !== undefined) setCategory(next.category);
    setPage(1);
    void fetchExpenses({ page: 1, limit: pageSize, ...merged });
  };

  // ---------- Yaratish / tahrirlash ----------
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ spentAt: dayjs() });
    setFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    form.setFieldsValue({
      category: expense.category,
      amount: expense.amount,
      description: expense.description ?? undefined,
      spentAt: dayjs(expense.spentAt),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        category: values.category.trim(),
        amount: values.amount,
        description: values.description || undefined,
        spentAt: values.spentAt ? values.spentAt.toISOString() : undefined,
      };
      const res = editing
        ? await expensesApi.update(editing.id, body)
        : await expensesApi.create(body);
      message.success(res.message);
      closeForm();
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    try {
      const res = await expensesApi.remove(expense.id);
      message.success(res.message);
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const categoryOptions = EXPENSE_CATEGORY_SUGGESTIONS.map((value) => ({
    value,
    label: t(`expenses.cat.${value}`),
  }));

  const columns: ColumnsType<Expense> = [
    {
      title: t('expenses.categoryCol'),
      dataIndex: 'category',
      width: 160,
      render: (value: string) => <Tag>{categoryLabel(value)}</Tag>,
    },
    {
      title: t('expenses.amountCol'),
      dataIndex: 'amount',
      width: 150,
      render: (value: number) => (
        <MoneyText amount={value} currency={t('common.sum')} color={TOKENS.color.semantic.warning} />
      ),
    },
    {
      title: t('expenses.descriptionCol'),
      dataIndex: 'description',
      ellipsis: true,
      responsive: ['md'],
      render: (value: string | null) =>
        value ? <Text type="secondary">{value}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: t('expenses.spentAtCol'),
      dataIndex: 'spentAt',
      width: 150,
      render: (value: string) => (
        <span className="tabular-nums">{dayjs(value).format('DD.MM.YYYY HH:mm')}</span>
      ),
    },
    {
      title: t('expenses.addedBy'),
      key: 'user',
      width: 140,
      responsive: ['lg'],
      render: (_, expense) => expense.user?.name ?? '—',
    },
    ...(canManage
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            width: 110,
            render: (_: unknown, expense: Expense) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={t('btn.edit')}
                  onClick={() => openEdit(expense)}
                />
                <Popconfirm
                  title={t('common.confirmDelete')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={() => void handleDelete(expense)}
                >
                  <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          } as ColumnsType<Expense>[number],
        ]
      : []),
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<WalletOutlined />}
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={refresh} aria-label={t('btn.refresh')} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('expenses.addExpense')}
            </Button>
          </>
        }
        stats={
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                label={t('expenses.statSum')}
                value={<MoneyText amount={sum} currency={t('common.sum')} size="lg" />}
                icon={<WalletOutlined />}
                accent={TOKENS.color.semantic.warning}
                loading={loading && sum === null}
              />
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                label={t('expenses.statCount')}
                value={<span className="tabular-nums">{total}</span>}
                icon={<NumberOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={loading && sum === null}
              />
            </Col>
          </Row>
        }
      />

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

      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: TOKENS.spacing.sm,
            marginBottom: TOKENS.spacing.md,
          }}
        >
          <RangePicker
            value={range}
            allowClear
            style={{ flex: '1 1 260px', maxWidth: 320 }}
            onChange={(value) =>
              applyFilters({ range: value && value[0] && value[1] ? [value[0], value[1]] : null })
            }
          />
          <Select
            allowClear
            value={category ?? undefined}
            placeholder={t('expenses.allCategories')}
            options={categoryOptions}
            style={{ flex: '1 1 180px', maxWidth: 240 }}
            onChange={(value) => applyFilters({ category: value ?? null })}
          />
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={expenses}
          loading={loading}
          scroll={{ x: 700 }}
          locale={{
            emptyText: loading ? (
              <span />
            ) : (
              <EmptyState
                icon={<WalletOutlined />}
                title={t('expenses.emptyTitle')}
                hint={t('expenses.emptyHint')}
                action={
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    {t('expenses.addExpense')}
                  </Button>
                }
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
              void fetchExpenses({ page: p, limit: ps, range, category });
            },
          }}
        />
      </Card>

      {/* Yaratish / tahrirlash oynasi */}
      <Modal
        title={editing ? t('expenses.editExpense') : t('expenses.addExpense')}
        open={formOpen}
        onCancel={closeForm}
        onOk={() => void handleSave()}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="category"
            label={t('expenses.categoryLabel')}
            rules={[{ required: true, whitespace: true, message: t('expenses.categoryRequired') }]}
          >
            <AutoComplete
              options={categoryOptions}
              placeholder={t('expenses.categoryPlaceholder')}
              maxLength={50}
              filterOption={(input, option) => {
                const q = input.toLowerCase();
                return (
                  (option?.value ?? '').toLowerCase().includes(q) ||
                  String(option?.label ?? '').toLowerCase().includes(q)
                );
              }}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t('expenses.amountLabel')}
            rules={[
              { required: true, message: t('expenses.amountRequired') },
              {
                validator: (_, value: number) =>
                  typeof value === 'number' && value > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('expenses.amountInvalid'))),
              },
            ]}
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0}
              addonAfter={t('common.sum')}
              formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
              parser={(value) => Number((value ?? '').replace(/\s/g, ''))}
            />
          </Form.Item>
          <Form.Item name="description" label={t('expenses.descriptionLabel')}>
            <Input.TextArea
              rows={2}
              maxLength={1000}
              placeholder={t('expenses.descriptionPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="spentAt"
            label={t('expenses.dateLabel')}
            extra={t('expenses.dateHint')}
          >
            <DatePicker showTime={{ format: 'HH:mm' }} style={{ width: '100%' }} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </PageTransition>
  );
};

export default Expenses;
