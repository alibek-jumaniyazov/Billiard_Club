import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, staffApi } from '../api';
import { ROLE_COLORS, ROLE_TAG_COLORS } from '../constants';
import { useAuth } from '../context/AuthContext';
import type { User, UserRole } from '../types';

const { Title, Text } = Typography;

/** Klub ichida tayinlanadigan rollar (superadmin bunga kirmaydi) */
const STAFF_ROLES: UserRole[] = ['admin', 'kassir', 'operator'];

interface CreateFormValues {
  name: string;
  username: string;
  password: string;
  role: UserRole;
}

interface EditFormValues {
  name: string;
  role: UserRole;
  isActive: boolean;
  password?: string;
}

const emptyCounts = (): Record<UserRole, number> => ({
  superadmin: 0,
  admin: 0,
  kassir: 0,
  operator: 0,
});

const Staff = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user: currentUser } = useAuth();

  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);

  const [roleCounts, setRoleCounts] = useState<Record<UserRole, number>>(emptyCounts);
  const [staffTotal, setStaffTotal] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [creating, setCreating] = useState(false);

  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [editForm] = Form.useForm<EditFormValues>();
  const [saving, setSaving] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffApi.list({
        page,
        limit: pageSize,
        search: search || undefined,
        role: roleFilter,
      });
      setStaff(res.data);
      setTotal(res.pagination?.total ?? res.data.length);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, message, t]);

  /** Rol bo'yicha to'liq sonlar — jadval sahifasidan qat'i nazar */
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await staffApi.list({ page: 1, limit: 500 });
      const counts = emptyCounts();
      for (const u of res.data) counts[u.role] += 1;
      setRoleCounts(counts);
      setStaffTotal(res.pagination?.total ?? res.data.length);
    } catch {
      // Ikkilamchi vidjet — asosiy jadval xatosi allaqachon ko'rsatiladi
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const refetchAll = () => {
    void fetchStaff();
    void fetchStats();
  };

  // ---------- Yaratish ----------
  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const res = await staffApi.create(values);
      message.success(res.message);
      setCreateOpen(false);
      createForm.resetFields();
      refetchAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  };

  // ---------- Tahrirlash ----------
  const openEdit = (record: User) => {
    editForm.setFieldsValue({
      name: record.name,
      role: record.role,
      isActive: record.isActive,
      password: '',
    });
    setEditingStaff(record);
  };

  const handleEdit = async () => {
    if (!editingStaff) return;
    const values = await editForm.validateFields();
    const body: { name: string; role: UserRole; isActive: boolean; password?: string } = {
      name: values.name,
      role: values.role,
      isActive: values.isActive,
    };
    if (values.password) body.password = values.password;
    setSaving(true);
    try {
      const res = await staffApi.update(editingStaff.id, body);
      message.success(res.message);
      setEditingStaff(null);
      refetchAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Faolsizlantirish (soft-delete) ----------
  const handleDeactivate = async (record: User) => {
    try {
      const res = await staffApi.remove(record.id);
      message.success(res.message);
      refetchAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const roleSelectOptions = [
    { value: 'admin', label: t('staff.roleAdmin') },
    { value: 'kassir', label: t('staff.roleKassir') },
    { value: 'operator', label: t('staff.roleOperator') },
  ];

  const isSelf = !!editingStaff && editingStaff.id === currentUser?.id;

  const columns: ColumnsType<User> = [
    {
      title: t('staff.fullName'),
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space size={8}>
          <Text strong>{name}</Text>
          {record.id === currentUser?.id && <Tag color="green">{t('staff.you')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('staff.username'),
      dataIndex: 'username',
      width: 160,
      render: (username: string) => <Text code>{username}</Text>,
    },
    {
      title: t('staff.role'),
      dataIndex: 'role',
      width: 130,
      render: (role: UserRole) => (
        <Tag color={ROLE_TAG_COLORS[role]}>{t(`role.${role}`)}</Tag>
      ),
    },
    {
      title: t('staff.status'),
      dataIndex: 'isActive',
      width: 120,
      render: (isActive: boolean) =>
        isActive ? (
          <Tag color="green">{t('status.active')}</Tag>
        ) : (
          <Tag color="red">{t('staff.inactive')}</Tag>
        ),
    },
    {
      title: t('staff.lastLogin'),
      dataIndex: 'lastLogin',
      width: 160,
      render: (lastLogin: string | null) =>
        lastLogin ? dayjs(lastLogin).format('DD.MM.YYYY HH:mm') : '—',
    },
    {
      title: t('staff.createdAt'),
      dataIndex: 'createdAt',
      width: 160,
      render: (createdAt: string) => dayjs(createdAt).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('btn.edit')}
          </Button>
          {record.isActive && record.id !== currentUser?.id && (
            <Popconfirm
              title={t('staff.deactivateConfirm')}
              description={t('staff.deactivateDesc')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDeactivate(record)}
            >
              <Button size="small" danger icon={<UserDeleteOutlined />}>
                {t('staff.deactivate')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 0 }}>
            <TeamOutlined /> {t('staff.title')}
          </Title>
          <Text type="secondary">{t('staff.subtitle')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refetchAll} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('staff.addStaff')}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('staff.totalStaff')} value={staffTotal} loading={statsLoading} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('staff.admins')}
              value={roleCounts.admin}
              loading={statsLoading}
              valueStyle={{ color: ROLE_COLORS.admin }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('staff.kassirs')}
              value={roleCounts.kassir}
              loading={statsLoading}
              valueStyle={{ color: ROLE_COLORS.kassir }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('staff.operators')}
              value={roleCounts.operator}
              loading={statsLoading}
              valueStyle={{ color: ROLE_COLORS.operator }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder={t('staff.searchPlaceholder')}
            style={{ width: 260 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          <Select<UserRole>
            allowClear
            placeholder={t('staff.filterRole')}
            style={{ width: 180 }}
            value={roleFilter}
            onChange={(value) => {
              setRoleFilter(value);
              setPage(1);
            }}
            options={STAFF_ROLES.map((role) => ({ value: role, label: t(`role.${role}`) }))}
          />
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={staff}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(ps !== pageSize ? 1 : p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* Yangi xodim */}
      <Modal
        title={t('staff.createTitle')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={creating}
        okText={t('btn.add')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('staff.fullName')}
            rules={[{ required: true, message: t('staff.nameRequired') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="username"
            label={t('staff.username')}
            rules={[
              { required: true, min: 3, message: t('staff.usernameRequired') },
              { pattern: /^[a-zA-Z0-9_.-]+$/, message: t('staff.usernamePattern') },
            ]}
          >
            <Input maxLength={50} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('staff.password')}
            rules={[{ required: true, min: 6, message: t('staff.passwordRequired') }]}
          >
            <Input.Password maxLength={100} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="role"
            label={t('staff.role')}
            rules={[{ required: true, message: t('staff.roleRequired') }]}
          >
            <Select options={roleSelectOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tahrirlash */}
      <Modal
        title={`${t('staff.editTitle')} — ${editingStaff?.name ?? ''}`}
        open={!!editingStaff}
        onCancel={() => setEditingStaff(null)}
        onOk={() => void handleEdit()}
        confirmLoading={saving}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
      >
        {isSelf && (
          <Alert
            type="info"
            showIcon
            message={t('staff.selfEditHint')}
            style={{ marginBottom: 12 }}
          />
        )}
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('staff.fullName')}
            rules={[{ required: true, message: t('staff.nameRequired') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="role"
            label={t('staff.role')}
            rules={[{ required: true, message: t('staff.roleRequired') }]}
          >
            <Select options={roleSelectOptions} disabled={isSelf} />
          </Form.Item>
          <Form.Item name="isActive" label={t('staff.status')} valuePropName="checked">
            <Switch
              disabled={isSelf}
              checkedChildren={t('status.active')}
              unCheckedChildren={t('staff.inactive')}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('staff.newPassword')}
            extra={t('staff.passwordHint')}
            rules={[{ min: 6, message: t('staff.passwordMin') }]}
          >
            <Input.Password maxLength={100} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Staff;
