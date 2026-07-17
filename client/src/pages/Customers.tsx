import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Row,
  Skeleton,
  Space,
  Table,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { customersApi, errorMessage } from '../api';
import { EmptyState, MoneyText, PageHeader, PageTransition, StatCard, StatusTag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { Customer, CustomerProfile, Session } from '../types';
import { formatDuration } from '../utils/format';

const { Text } = Typography;

interface FetchParams {
  page: number;
  limit: number;
  search: string;
}

interface CustomerFormValues {
  name: string;
  phone?: string;
  notes?: string;
}

const Customers = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  // Yaratish / tahrirlash draweri
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CustomerFormValues>();

  // Profil draweri
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);

  const canEdit = hasRole('superadmin', 'admin', 'kassir');
  const canDelete = hasRole('superadmin', 'admin');

  const fetchCustomers = useCallback(
    async (params: FetchParams) => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await customersApi.list({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
        });
        // Mutatsiyadan keyin sahifa bo'shab qolsa bitta orqaga qaytamiz
        if (res.data.length === 0 && params.page > 1 && (res.pagination?.total ?? 0) > 0) {
          setPage(params.page - 1);
          return fetchCustomers({ ...params, page: params.page - 1 });
        }
        setCustomers(res.data);
        setTotal(res.pagination?.total ?? 0);
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
    void fetchCustomers({ page: 1, limit: 20, search: '' });
  }, [fetchCustomers]);

  const refresh = () => void fetchCustomers({ page, limit: pageSize, search });

  const applySearch = (value: string) => {
    setSearch(value);
    setPage(1);
    void fetchCustomers({ page: 1, limit: pageSize, search: value });
  };

  // ---------- Yaratish / tahrirlash ----------
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    form.setFieldsValue({
      name: customer.name,
      phone: customer.phone ?? undefined,
      notes: customer.notes ?? undefined,
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
        name: values.name,
        phone: values.phone || undefined,
        notes: values.notes || undefined,
      };
      const res = editing
        ? await customersApi.update(editing.id, body)
        : await customersApi.create(body);
      message.success(res.message);
      closeForm();
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  // ---------- O'chirish (server ochiq qarzli mijozni bloklaydi) ----------
  const handleDelete = async (customer: Customer) => {
    try {
      const res = await customersApi.remove(customer.id);
      message.success(res.message);
      if (profileId === customer.id) setProfileId(null);
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('customers.deleteGuardHint')));
    }
  };

  // ---------- Profil ----------
  const openProfile = useCallback(
    async (id: number) => {
      setProfileId(id);
      setProfile(null);
      setProfileError(false);
      setProfileLoading(true);
      try {
        const res = await customersApi.profile(id);
        setProfile(res.data);
      } catch (err) {
        setProfileError(true);
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setProfileLoading(false);
      }
    },
    [message, t],
  );

  const columns: ColumnsType<Customer> = [
    {
      title: t('customers.nameLabel'),
      key: 'name',
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <Text strong>{customer.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {customer.phone ?? t('customers.noPhone')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.notes'),
      dataIndex: 'notes',
      ellipsis: true,
      responsive: ['md'],
      render: (notes: string | null) =>
        notes ? <Text type="secondary">{notes}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: t('customers.registeredAt'),
      dataIndex: 'createdAt',
      width: 140,
      responsive: ['sm'],
      render: (value: string) => (
        <span className="tabular-nums">{dayjs(value).format('DD.MM.YYYY')}</span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 200,
      render: (_, customer) => (
        <Space wrap size={4}>
          <Button size="small" icon={<UserOutlined />} onClick={() => void openProfile(customer.id)}>
            {t('customers.view')}
          </Button>
          {canEdit && (
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              aria-label={t('btn.edit')}
              onClick={() => openEdit(customer)}
            />
          )}
          {canDelete && (
            <Popconfirm
              title={t('common.confirmDelete')}
              description={t('customers.deleteGuardHint')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => void handleDelete(customer)}
            >
              <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const sessionColumns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, session) => session.table?.name ?? '—',
    },
    {
      title: t('common.date'),
      dataIndex: 'startTime',
      width: 130,
      render: (value: string) => (
        <span className="tabular-nums">{dayjs(value).format('DD.MM.YYYY HH:mm')}</span>
      ),
    },
    {
      title: t('common.duration'),
      dataIndex: 'durationMinutes',
      width: 110,
      render: (value: number | null) =>
        value !== null ? formatDuration(value, t('common.hours'), t('common.minutes')) : '—',
    },
    {
      title: t('common.total'),
      dataIndex: 'totalAmount',
      width: 130,
      render: (value: number) => <MoneyText amount={value} currency={t('common.sum')} size="sm" />,
    },
    {
      title: t('customers.statusCol'),
      dataIndex: 'status',
      width: 120,
      render: (status: Session['status']) => (
        <StatusTag status={status} label={t(`status.${status}`)} />
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<TeamOutlined />}
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={refresh} aria-label={t('btn.refresh')} />
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                {t('customers.addCustomer')}
              </Button>
            )}
          </>
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
            alignItems: 'center',
            marginBottom: TOKENS.spacing.md,
          }}
        >
          <Input.Search
            placeholder={t('customers.searchPlaceholder')}
            allowClear
            enterButton
            onSearch={applySearch}
            style={{ maxWidth: 380, flex: '1 1 240px' }}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('customers.totalCount')}: <span className="tabular-nums">{total}</span>
          </Text>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={customers}
          loading={loading}
          scroll={{ x: 640 }}
          locale={{
            emptyText: loading ? (
              <span />
            ) : (
              <EmptyState
                icon={<TeamOutlined />}
                title={search ? t('customers.emptySearchTitle') : t('customers.emptyTitle')}
                hint={search ? t('customers.emptySearchHint') : t('customers.emptyHint')}
                action={
                  !search && canEdit ? (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                      {t('customers.addCustomer')}
                    </Button>
                  ) : undefined
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
              void fetchCustomers({ page: p, limit: ps, search });
            },
          }}
        />
      </Card>

      {/* Yaratish / tahrirlash draweri */}
      <Drawer
        title={editing ? t('customers.editCustomer') : t('customers.addCustomer')}
        open={formOpen}
        onClose={closeForm}
        width="min(420px, 100vw)"
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={closeForm}>{t('btn.cancel')}</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {t('btn.save')}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={() => void handleSave()}>
          <Form.Item
            name="name"
            label={t('customers.nameLabel')}
            rules={[{ required: true, message: t('customers.nameRequired') }]}
          >
            <Input maxLength={100} autoFocus />
          </Form.Item>
          <Form.Item name="phone" label={t('customers.phoneLabel')}>
            <Input maxLength={20} placeholder={t('customers.phonePlaceholder')} inputMode="tel" />
          </Form.Item>
          <Form.Item name="notes" label={t('customers.notesLabel')}>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              placeholder={t('customers.notesPlaceholder')}
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Profil draweri */}
      <Drawer
        title={profile?.customer.name ?? t('customers.detailTitle')}
        open={profileId !== null}
        onClose={() => setProfileId(null)}
        width="min(640px, 100vw)"
      >
        {profileLoading && <Skeleton active paragraph={{ rows: 6 }} />}

        {!profileLoading && profileError && (
          <Alert
            type="error"
            showIcon
            message={t('common.error')}
            action={
              profileId !== null ? (
                <Button size="small" onClick={() => void openProfile(profileId)}>
                  {t('btn.refresh')}
                </Button>
              ) : undefined
            }
          />
        )}

        {!profileLoading && profile && (
          <>
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={8}>
                <StatCard
                  label={t('customers.statSessions')}
                  value={<span className="tabular-nums">{profile.stats.totalSessions}</span>}
                  icon={<PlayCircleOutlined />}
                  accent={TOKENS.color.emerald.bright}
                />
              </Col>
              <Col xs={24} sm={8}>
                <StatCard
                  label={t('customers.statSpent')}
                  value={<MoneyText amount={profile.stats.totalSpent} currency={t('common.sum')} size="lg" />}
                  icon={<DollarOutlined />}
                />
              </Col>
              <Col xs={24} sm={8}>
                <StatCard
                  label={t('customers.statOpenDebt')}
                  value={
                    <MoneyText
                      amount={profile.stats.openDebt}
                      currency={t('common.sum')}
                      size="lg"
                      color={
                        profile.stats.openDebt > 0
                          ? TOKENS.color.semantic.error
                          : TOKENS.color.text.primary
                      }
                    />
                  }
                  icon={<ExclamationCircleOutlined />}
                  accent={
                    profile.stats.openDebt > 0
                      ? TOKENS.color.semantic.error
                      : TOKENS.color.semantic.success
                  }
                />
              </Col>
            </Row>

            <Descriptions
              column={1}
              size="small"
              style={{ marginTop: TOKENS.spacing.lg }}
              items={[
                {
                  key: 'phone',
                  label: t('customers.phoneLabel'),
                  children: profile.customer.phone ?? t('customers.noPhone'),
                },
                {
                  key: 'notes',
                  label: t('customers.notesLabel'),
                  children: profile.customer.notes ?? '—',
                },
                {
                  key: 'createdAt',
                  label: t('customers.registeredAt'),
                  children: dayjs(profile.customer.createdAt).format('DD.MM.YYYY HH:mm'),
                },
              ]}
            />

            <Text strong style={{ display: 'block', margin: `${TOKENS.spacing.lg}px 0 ${TOKENS.spacing.sm}px` }}>
              {t('customers.recentSessions')}
            </Text>
            {profile.recentSessions.length === 0 ? (
              <EmptyState
                icon={<PlayCircleOutlined />}
                title={t('customers.noSessions')}
                hint={t('customers.noSessionsHint')}
                style={{ padding: '24px 12px' }}
              />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={sessionColumns}
                dataSource={profile.recentSessions}
                pagination={false}
                scroll={{ x: 560 }}
              />
            )}
          </>
        )}
      </Drawer>
    </PageTransition>
  );
};

export default Customers;
