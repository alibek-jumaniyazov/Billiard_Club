import { useCallback, useEffect, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  KeyOutlined,
  LockOutlined,
  LoginOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { adminApi, errorMessage } from '../api';
import { viewingClub } from '../api/client';
import { CLUB_STATUS_COLORS } from '../constants';
import type { Club, ClubStats, Contract, ContractType, PlatformOverview } from '../types';
import { formatMoney, formatNumber } from '../utils/format';

const { Title, Text } = Typography;

/** Platforma daromadi uchun oltin urg'u rangi */
const GOLD = '#faad14';

const CONTRACT_TYPES: ContractType[] = ['monthly', 'quarterly', 'semiannual', 'yearly', 'custom'];

interface ContractFormValues {
  type: ContractType;
  amount: number;
  endDate?: Dayjs;
  notes?: string;
}

/** Tasodifiy xavfsiz parol */
const generatePassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

const AdminClubs = () => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const [editClub, setEditClub] = useState<Club | null>(null);
  const [editForm] = Form.useForm();

  const [passwordClub, setPasswordClub] = useState<Club | null>(null);
  const [passwordForm] = Form.useForm();

  const [extendClub, setExtendClub] = useState<Club | null>(null);
  const [extendDate, setExtendDate] = useState<Dayjs | null>(null);

  const [statsClub, setStatsClub] = useState<ClubStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Shartnomalar draweri
  const [contractsClub, setContractsClub] = useState<Club | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractForm] = Form.useForm<ContractFormValues>();
  const contractTypeValue: ContractType | undefined = Form.useWatch('type', contractForm);

  // "Tugayapti" ro'yxatidan tanlangan klubga fokus
  const [focusClubId, setFocusClubId] = useState<number | null>(null);
  const clubsAnchorRef = useRef<HTMLDivElement | null>(null);

  const fetchClubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.clubs();
      setClubs(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await adminApi.overview();
      setOverview(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setOverviewLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void fetchClubs();
    void fetchOverview();
  }, [fetchClubs, fetchOverview]);

  const refreshAll = useCallback(() => {
    void fetchClubs();
    void fetchOverview();
  }, [fetchClubs, fetchOverview]);

  // ---------- Yaratish ----------
  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await adminApi.createClub(values);
      setCreateOpen(false);
      createForm.resetFields();
      // Kirish ma'lumotlarini bir marta ko'rsatamiz (parol qayta ko'rinmaydi)
      modal.success({
        title: t('adminClubs.credentialsTitle'),
        width: 460,
        content: (
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
            <Alert type="warning" message={t('adminClubs.credentialsWarn')} showIcon />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('adminClubs.clubName')}>
                {values.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('adminClubs.adminUsername')}>
                <Text code copyable>{values.adminUsername}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('adminClubs.adminPassword')}>
                <Text code copyable>{values.adminPassword}</Text>
              </Descriptions.Item>
            </Descriptions>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${values.name}\nLogin: ${values.adminUsername}\nParol: ${values.adminPassword}`,
                );
                message.success(t('adminClubs.copied'));
              }}
            >
              {t('adminClubs.copy')}
            </Button>
          </Space>
        ),
      });
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCreating(false);
    }
  };

  // ---------- Tahrirlash ----------
  const handleEdit = async () => {
    if (!editClub) return;
    const values = await editForm.validateFields();
    try {
      const res = await adminApi.updateClub(editClub.id, values);
      message.success(res.message);
      setEditClub(null);
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Uzaytirish ----------
  const doExtend = async (club: Club, body: { months?: number; until?: string }) => {
    try {
      const res = await adminApi.extend(club.id, body);
      message.success(res.message);
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Blok / parol ----------
  const handleBlockToggle = async (club: Club) => {
    try {
      const res = club.status === 'blocked'
        ? await adminApi.unblock(club.id)
        : await adminApi.block(club.id);
      message.success(res.message);
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const handleResetPassword = async () => {
    if (!passwordClub) return;
    const values = await passwordForm.validateFields();
    try {
      const res = await adminApi.resetPassword(passwordClub.id, values.password);
      message.success(`${res.message} (${res.data.username})`);
      setPasswordClub(null);
      passwordForm.resetFields();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const handleDelete = async (club: Club) => {
    try {
      const res = await adminApi.removeClub(club.id);
      message.success(res.message);
      if (focusClubId === club.id) setFocusClubId(null);
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Statistika ----------
  const openStats = async (club: Club) => {
    setStatsLoading(true);
    setStatsClub(null);
    try {
      const res = await adminApi.clubStats(club.id);
      setStatsClub(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setStatsLoading(false);
    }
  };

  // ---------- Shartnomalar ----------
  const fetchContracts = useCallback(async (clubId: number) => {
    setContractsLoading(true);
    try {
      const res = await adminApi.contracts(clubId);
      setContracts(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setContractsLoading(false);
    }
  }, [message, t]);

  const openContracts = (club: Club) => {
    setContracts([]);
    setContractsClub(club);
    void fetchContracts(club.id);
  };

  const handleAddContract = async () => {
    if (!contractsClub) return;
    const values = await contractForm.validateFields();
    setContractSaving(true);
    try {
      const res = await adminApi.addContract(contractsClub.id, {
        type: values.type,
        amount: values.amount,
        endDate:
          values.type === 'custom' && values.endDate
            ? values.endDate.endOf('day').toISOString()
            : undefined,
        notes: values.notes || undefined,
      });
      message.success(res.message);
      contractForm.resetFields();
      void fetchContracts(contractsClub.id);
      refreshAll();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setContractSaving(false);
    }
  };

  const handleRemoveContract = async (contractId: number) => {
    if (!contractsClub) return;
    try {
      const res = await adminApi.removeContract(contractsClub.id, contractId);
      message.success(res.message);
      void fetchContracts(contractsClub.id);
      void fetchOverview();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Klub panelini ko'rish ----------
  const handleEnterClub = (club: Club) => {
    viewingClub.set(club.id, club.name);
    navigate('/dashboard');
  };

  // "Tugayapti" ro'yxatidan bosilganda jadvalga o'tib, faqat shu klubni ko'rsatamiz
  const focusClub = (club: Club) => {
    setFocusClubId(club.id);
    clubsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const contractTypeLabel = (type: ContractType): string => t(`adminClubs.ct_${type}`);

  const columns: ColumnsType<Club> = [
    {
      title: t('adminClubs.clubName'),
      dataIndex: 'name',
      render: (name: string, club) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {club.ownerName} {club.phone ? `· ${club.phone}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: t('adminClubs.status'),
      dataIndex: 'status',
      width: 130,
      render: (status: Club['status']) => (
        <Tag color={CLUB_STATUS_COLORS[status]}>{t(`club.${status}`)}</Tag>
      ),
      filters: (['trial', 'active', 'expired', 'blocked'] as const).map((s) => ({
        text: t(`club.${s}`),
        value: s,
      })),
      onFilter: (value, club) => club.status === value,
    },
    {
      title: t('adminClubs.endsAt'),
      dataIndex: 'effectiveEndsAt',
      width: 200,
      sorter: (a, b) =>
        new Date(a.effectiveEndsAt ?? 0).getTime() - new Date(b.effectiveEndsAt ?? 0).getTime(),
      render: (endsAt: string | null, club) => {
        if (!endsAt) return t('adminClubs.noEnd');
        const date = dayjs(endsAt).format('DD.MM.YYYY');
        if (club.isExpired) {
          return (
            <Text type="danger">
              {date} · {t('adminClubs.expiredAgo')}
            </Text>
          );
        }
        return (
          <Space size={6}>
            <Text>{date}</Text>
            <Tag color={(club.daysLeft ?? 99) <= 3 ? 'red' : (club.daysLeft ?? 99) <= 7 ? 'orange' : 'green'}>
              {club.daysLeft} {t('adminClubs.daysLeft')}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 430,
      render: (_, club) => (
        <Space wrap size={4}>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<LoginOutlined />}
            title={t('adminClubs.viewAsClub')}
            onClick={() => handleEnterClub(club)}
          >
            {t('adminClubs.view')}
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: '1', label: t('adminClubs.extend1'), onClick: () => void doExtend(club, { months: 1 }) },
                { key: '3', label: t('adminClubs.extend3'), onClick: () => void doExtend(club, { months: 3 }) },
                { key: '6', label: t('adminClubs.extend6'), onClick: () => void doExtend(club, { months: 6 }) },
                { key: '12', label: t('adminClubs.extend12'), onClick: () => void doExtend(club, { months: 12 }) },
                { type: 'divider' },
                {
                  key: 'custom',
                  icon: <CalendarOutlined />,
                  label: t('adminClubs.extendCustom'),
                  onClick: () => {
                    setExtendDate(null);
                    setExtendClub(club);
                  },
                },
              ],
            }}
          >
            <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
              {t('adminClubs.extend')}
            </Button>
          </Dropdown>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => openContracts(club)}>
            {t('adminClubs.contractBtn')}
          </Button>
          <Button
            size="small"
            icon={<BarChartOutlined />}
            title={t('adminClubs.viewStats')}
            onClick={() => void openStats(club)}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            title={t('adminClubs.editClub')}
            onClick={() => {
              editForm.setFieldsValue({
                name: club.name,
                ownerName: club.ownerName,
                phone: club.phone,
                address: club.address,
                notes: club.notes,
              });
              setEditClub(club);
            }}
          />
          <Button
            size="small"
            icon={<KeyOutlined />}
            title={t('adminClubs.resetPassword')}
            onClick={() => setPasswordClub(club)}
          />
          {club.status === 'blocked' ? (
            <Button
              size="small"
              icon={<UnlockOutlined />}
              onClick={() => void handleBlockToggle(club)}
            >
              {t('adminClubs.unblock')}
            </Button>
          ) : (
            <Popconfirm
              title={t('adminClubs.blockConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => void handleBlockToggle(club)}
            >
              <Button size="small" danger icon={<LockOutlined />}>
                {t('adminClubs.block')}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={t('adminClubs.deleteConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => void handleDelete(club)}
          >
            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const contractColumns: ColumnsType<Contract> = [
    {
      title: t('adminClubs.contractType'),
      dataIndex: 'type',
      width: 120,
      render: (type: ContractType) => <Tag color="gold">{contractTypeLabel(type)}</Tag>,
    },
    {
      title: t('adminClubs.contractAmount'),
      dataIndex: 'amount',
      width: 150,
      render: (amount: number) => <Text strong>{formatMoney(amount, t('common.sum'))}</Text>,
    },
    {
      title: t('adminClubs.contractPeriod'),
      key: 'period',
      width: 200,
      render: (_, c) =>
        `${dayjs(c.startDate).format('DD.MM.YYYY')} — ${dayjs(c.endDate).format('DD.MM.YYYY')}`,
    },
    {
      title: t('common.notes'),
      dataIndex: 'notes',
      ellipsis: true,
      render: (notes: string | null) => notes || '—',
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      key: 'actions',
      width: 50,
      render: (_, c) => (
        <Popconfirm
          title={t('adminClubs.contractDeleteConfirm')}
          okText={t('common.yes')}
          cancelText={t('common.no')}
          onConfirm={() => void handleRemoveContract(c.id)}
        >
          <Button size="small" danger type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const recentContractColumns: ColumnsType<Contract> = [
    {
      title: t('adminClubs.clubName'),
      key: 'club',
      render: (_, c) => <Text strong>{c.club?.name ?? '—'}</Text>,
    },
    {
      title: t('adminClubs.contractType'),
      dataIndex: 'type',
      width: 140,
      render: (type: ContractType) => <Tag color="gold">{contractTypeLabel(type)}</Tag>,
    },
    {
      title: t('adminClubs.contractAmount'),
      dataIndex: 'amount',
      width: 170,
      render: (amount: number) => formatMoney(amount, t('common.sum')),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
    },
  ];

  const clubCounts = overview?.clubs ?? {
    total: clubs.length,
    trial: clubs.filter((c) => c.status === 'trial').length,
    active: clubs.filter((c) => c.status === 'active').length,
    expired: clubs.filter((c) => c.status === 'expired').length,
    blocked: clubs.filter((c) => c.status === 'blocked').length,
  };

  const chartData = (overview?.incomeByMonth ?? []).map((m) => ({
    label: dayjs(`${m.month}-01`).format('MM.YY'),
    amount: m.amount,
  }));

  const focusedClub = focusClubId != null ? clubs.find((c) => c.id === focusClubId) : undefined;
  const tableData = focusedClub ? [focusedClub] : clubs;

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
            <ShopOutlined /> {t('adminClubs.title')}
          </Title>
          <Text type="secondary">{t('adminClubs.subtitle')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('adminClubs.addClub')}
          </Button>
        </Space>
      </div>

      {/* ==================== Platforma ko'rinishi ==================== */}
      <div style={{ marginBottom: 12 }}>
        <Title level={5} style={{ marginBottom: 0 }}>
          <DollarOutlined /> {t('adminClubs.overviewTitle')}
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('adminClubs.incomeHint')}
        </Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.incomeTotal')}
              value={formatMoney(overview?.income.total ?? 0, t('common.sum'))}
              valueStyle={{ color: GOLD, fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.incomeMonth')}
              value={formatMoney(overview?.income.thisMonth ?? 0, t('common.sum'))}
            />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.incomeYear')}
              value={formatMoney(overview?.income.thisYear ?? 0, t('common.sum'))}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card loading={overviewLoading}>
            <Statistic title={t('adminClubs.totalClubs')} value={clubCounts.total} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.trialClubs')}
              value={clubCounts.trial}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.activeClubs')}
              value={clubCounts.active}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.expiredClubs')}
              value={clubCounts.expired}
              valueStyle={{ color: clubCounts.expired > 0 ? '#fa8c16' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card loading={overviewLoading}>
            <Statistic
              title={t('adminClubs.blockedClubs')}
              value={clubCounts.blocked}
              valueStyle={{ color: clubCounts.blocked > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={t('adminClubs.incomeChartTitle')} loading={overviewLoading}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={{ stroke: token.colorSplit }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumber(v)}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <ChartTooltip
                  cursor={{ fill: token.colorFillTertiary }}
                  formatter={(value) => formatMoney(Number(value), t('common.sum'))}
                  contentStyle={{
                    background: token.colorBgElevated,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: token.colorText }}
                  itemStyle={{ color: token.colorText }}
                />
                <Bar
                  dataKey="amount"
                  name={t('adminClubs.incomeSeries')}
                  fill={GOLD}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                {t('adminClubs.expiringTitle')}
              </Space>
            }
            loading={overviewLoading}
          >
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <List
                size="small"
                dataSource={overview?.expiringSoon ?? []}
                locale={{ emptyText: t('adminClubs.expiringEmpty') }}
                renderItem={(club) => (
                  <List.Item
                    style={{ cursor: 'pointer', paddingInline: 0 }}
                    onClick={() => focusClub(club)}
                    extra={
                      <Tag color={(club.daysLeft ?? 99) <= 3 ? 'red' : 'orange'}>
                        {club.daysLeft} {t('adminClubs.daysLeft')}
                      </Tag>
                    }
                  >
                    <Text>{club.name}</Text>
                  </List.Item>
                )}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <FileTextOutlined />
            {t('adminClubs.recentContracts')}
          </Space>
        }
        style={{ marginBottom: 16 }}
        loading={overviewLoading}
      >
        <Table
          rowKey="id"
          size="small"
          columns={recentContractColumns}
          dataSource={overview?.recentContracts ?? []}
          pagination={false}
          scroll={{ x: 640 }}
        />
      </Card>

      {/* ==================== Klublar ==================== */}
      <div ref={clubsAnchorRef}>
        <Card
          title={
            <Space>
              {t('adminClubs.clubsTitle')}
              {focusedClub && (
                <Tag
                  color="blue"
                  closable
                  onClose={() => setFocusClubId(null)}
                  title={t('adminClubs.focusedClub')}
                >
                  {focusedClub.name}
                </Tag>
              )}
            </Space>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={tableData}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1000 }}
          />
        </Card>
      </div>

      {/* Yangi klub */}
      <Modal
        title={t('adminClubs.createTitle')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={creating}
        okText={t('btn.add')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" initialValues={{ trialDays: 7 }}>
          <Form.Item
            name="name"
            label={t('adminClubs.clubName')}
            rules={[{ required: true, message: t('adminClubs.nameRequired') }]}
          >
            <Input maxLength={150} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="ownerName"
                label={t('adminClubs.ownerName')}
                rules={[{ required: true, message: t('adminClubs.ownerRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label={t('adminClubs.phone')}>
                <Input maxLength={20} placeholder="+998" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="adminUsername"
                label={t('adminClubs.adminUsername')}
                rules={[
                  { required: true, min: 3, message: t('adminClubs.usernameRequired') },
                  {
                    pattern: /^[a-zA-Z0-9_.-]+$/,
                    message: 'a-z, 0-9, _ . -',
                  },
                ]}
              >
                <Input maxLength={50} autoComplete="off" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="adminPassword"
                label={t('adminClubs.adminPassword')}
                rules={[{ required: true, min: 6, message: t('adminClubs.passwordRequired') }]}
              >
                <Input
                  maxLength={100}
                  autoComplete="new-password"
                  addonAfter={
                    <Button
                      type="text"
                      size="small"
                      onClick={() => createForm.setFieldValue('adminPassword', generatePassword())}
                    >
                      {t('adminClubs.generate')}
                    </Button>
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="trialDays" label={t('adminClubs.trialDays')}>
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notes" label={t('adminClubs.notes')}>
                <Input maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Tahrirlash */}
      <Modal
        title={t('adminClubs.editClub')}
        open={!!editClub}
        onCancel={() => setEditClub(null)}
        onOk={() => void handleEdit()}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('adminClubs.clubName')}
            rules={[{ required: true, message: t('adminClubs.nameRequired') }]}
          >
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="ownerName" label={t('adminClubs.ownerName')}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="phone" label={t('adminClubs.phone')}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="address" label={t('adminClubs.address')}>
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="notes" label={t('adminClubs.notes')}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Parol yangilash */}
      <Modal
        title={`${t('adminClubs.resetPassword')} — ${passwordClub?.name ?? ''}`}
        open={!!passwordClub}
        onCancel={() => {
          setPasswordClub(null);
          passwordForm.resetFields();
        }}
        onOk={() => void handleResetPassword()}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="password"
            label={t('adminClubs.newPassword')}
            rules={[{ required: true, min: 6, message: t('adminClubs.passwordRequired') }]}
          >
            <Input
              autoComplete="new-password"
              addonAfter={
                <Button
                  type="text"
                  size="small"
                  onClick={() => passwordForm.setFieldValue('password', generatePassword())}
                >
                  {t('adminClubs.generate')}
                </Button>
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Aniq sanagacha uzaytirish */}
      <Modal
        title={`${t('adminClubs.extend')} — ${extendClub?.name ?? ''}`}
        open={!!extendClub}
        onCancel={() => setExtendClub(null)}
        okText={t('btn.confirm')}
        cancelText={t('btn.cancel')}
        okButtonProps={{ disabled: !extendDate }}
        onOk={() => {
          if (extendClub && extendDate) {
            void doExtend(extendClub, { until: extendDate.endOf('day').toISOString() });
            setExtendClub(null);
          }
        }}
      >
        <Form layout="vertical">
          <Form.Item label={t('adminClubs.extendUntil')} required>
            <DatePicker
              style={{ width: '100%' }}
              value={extendDate}
              onChange={setExtendDate}
              disabledDate={(d) => d.isBefore(dayjs(), 'day')}
              format="DD.MM.YYYY"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Shartnomalar draweri */}
      <Drawer
        title={`${t('adminClubs.contractsTitle')} — ${contractsClub?.name ?? ''}`}
        open={!!contractsClub}
        onClose={() => {
          setContractsClub(null);
          contractForm.resetFields();
        }}
        width={680}
        forceRender
      >
        <Table
          rowKey="id"
          size="small"
          columns={contractColumns}
          dataSource={contracts}
          loading={contractsLoading}
          pagination={false}
          scroll={{ x: 700 }}
        />

        <Divider>{t('adminClubs.newContract')}</Divider>

        <Alert
          type="info"
          showIcon
          message={t('adminClubs.contractAutoExtend')}
          style={{ marginBottom: 16 }}
        />

        <Form form={contractForm} layout="vertical" initialValues={{ type: 'monthly' }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="type"
                label={t('adminClubs.contractType')}
                rules={[{ required: true }]}
              >
                <Select
                  options={CONTRACT_TYPES.map((v) => ({ value: v, label: contractTypeLabel(v) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="amount"
                label={t('adminClubs.contractAmount')}
                rules={[{ required: true, message: t('adminClubs.amountRequired') }]}
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  step={50000}
                  formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                  parser={(v) => (v ?? '').replace(/\s/g, '') as unknown as number}
                />
              </Form.Item>
            </Col>
          </Row>
          {contractTypeValue === 'custom' && (
            <Form.Item
              name="endDate"
              label={t('adminClubs.contractEndDate')}
              rules={[{ required: true, message: t('adminClubs.endDateRequired') }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD.MM.YYYY"
                // Server sharti bilan bir xil: sana joriy obuna tugashidan
                // (kelajakda bo'lsa) yoki bugundan KEYIN bo'lishi kerak
                disabledDate={(d) => {
                  const currentEnd = contractsClub?.effectiveEndsAt
                    ? dayjs(contractsClub.effectiveEndsAt)
                    : null;
                  const minDate =
                    currentEnd && currentEnd.isAfter(dayjs()) ? currentEnd : dayjs();
                  return d.isBefore(minDate, 'day') || d.isSame(minDate, 'day');
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="notes" label={t('common.notes')}>
            <Input maxLength={500} />
          </Form.Item>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            loading={contractSaving}
            onClick={() => void handleAddContract()}
          >
            {t('btn.add')}
          </Button>
        </Form>
      </Drawer>

      {/* Statistika draweri */}
      <Drawer
        title={t('adminClubs.statsTitle')}
        open={statsLoading || !!statsClub}
        onClose={() => setStatsClub(null)}
        width={420}
        loading={statsLoading}
      >
        {statsClub && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('adminClubs.clubName')}>
                {statsClub.club.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('adminClubs.adminLogin')}>
                <Text code>{statsClub.adminUsername ?? '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('adminClubs.status')}>
                <Tag color={CLUB_STATUS_COLORS[statsClub.club.status]}>
                  {t(`club.${statsClub.club.status}`)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('adminClubs.lastActivity')}>
                {statsClub.lastActivityAt
                  ? dayjs(statsClub.lastActivityAt).format('DD.MM.YYYY HH:mm')
                  : t('adminClubs.never')}
              </Descriptions.Item>
            </Descriptions>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Card size="small">
                  <Statistic title={t('adminClubs.users')} value={statsClub.users} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic title={t('adminClubs.tables')} value={statsClub.tables} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic title={t('adminClubs.activeSessions')} value={statsClub.activeSessions} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic title={t('adminClubs.totalSessions')} value={statsClub.totalSessions} />
                </Card>
              </Col>
              <Col span={24}>
                <Card size="small">
                  <Statistic
                    title={t('adminClubs.monthlyRevenue')}
                    value={formatMoney(statsClub.monthlyRevenue, t('common.sum'))}
                  />
                </Card>
              </Col>
              <Col span={24}>
                <Card size="small">
                  <Statistic
                    title={t('adminClubs.unpaidDebts')}
                    value={formatMoney(statsClub.unpaidDebts, t('common.sum'))}
                    valueStyle={{ color: statsClub.unpaidDebts > 0 ? '#ff4d4f' : undefined }}
                  />
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default AdminClubs;
