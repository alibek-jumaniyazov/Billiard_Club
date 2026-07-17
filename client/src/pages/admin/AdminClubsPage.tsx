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
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  KeyOutlined,
  LockOutlined,
  LoginOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminApi, adminBillingApi, errorMessage } from '../../api';
import { viewingClub } from '../../api/client';
import { EmptyState, PageHeader, PageTransition, StatCard, StatusTag } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type {
  Club,
  ClubStats,
  ClubStatus,
  Contract,
  ContractType,
  Invoice,
  InvoiceStatus,
} from '../../types';
import { formatMoney, formatNumber } from '../../utils/format';

const { Text } = Typography;

const CONTRACT_TYPES: ContractType[] = ['monthly', 'quarterly', 'semiannual', 'yearly', 'custom'];
const CLUB_STATUSES: ClubStatus[] = ['trial', 'active', 'expired', 'blocked'];

/** Faktura holati -> StatusTag semantik kaliti */
const INVOICE_TAG_STATUS: Record<InvoiceStatus, string> = {
  pending: 'warning',
  paid: 'paid',
  cancelled: 'cancelled',
  expired: 'error',
};

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

const PAGE_SIZE_DEFAULT = 20;

/**
 * Superadmin — klublar ro'yxati: server tomonida qidiruv/filtr/sahifalash,
 * batafsil drawer (shartnomalar + fakturalar + foydalanuvchilar), uzaytirish,
 * bloklash, shartnoma tuzish, kirish ma'lumotlarini nusxalash, klub panelini ochish.
 */
const AdminClubsPage = () => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ---------- Ro'yxat holati ----------
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [status, setStatus] = useState<ClubStatus | undefined>(undefined);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Modallar ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const [editClub, setEditClub] = useState<Club | null>(null);
  const [editForm] = Form.useForm();

  const [passwordClub, setPasswordClub] = useState<Club | null>(null);
  const [passwordForm] = Form.useForm();

  const [extendClub, setExtendClub] = useState<Club | null>(null);
  const [extendDate, setExtendDate] = useState<Dayjs | null>(null);

  // ---------- Batafsil drawer ----------
  const [detailClub, setDetailClub] = useState<Club | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [detailStats, setDetailStats] = useState<ClubStats | null>(null);
  const [detailStatsLoading, setDetailStatsLoading] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractForm] = Form.useForm<ContractFormValues>();
  const contractTypeValue: ContractType | undefined = Form.useWatch('type', contractForm);

  // ---------- Ma'lumot yuklash ----------
  const fetchClubs = useCallback(
    async (params: { page: number; pageSize: number; search: string; status?: ClubStatus }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.clubs({
          search: params.search.trim() || undefined,
          status: params.status,
          page: params.page,
          limit: params.pageSize,
        });
        setClubs(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
      } catch (err) {
        setError(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchClubs({ page: 1, pageSize: PAGE_SIZE_DEFAULT, search: searchParams.get('search') ?? '' });
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // Faqat birinchi renderda — keyingi yuklashlar aniq parametrlar bilan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshList = useCallback(() => {
    void fetchClubs({ page, pageSize, search, status });
  }, [fetchClubs, page, pageSize, search, status]);

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      void fetchClubs({ page: 1, pageSize, search: value, status });
    }, 400);
  };

  const onStatusChange = (value: ClubStatus | undefined) => {
    setStatus(value);
    setPage(1);
    void fetchClubs({ page: 1, pageSize, search, status: value });
  };

  // ---------- Kirish ma'lumotlari modal ----------
  const showCredentials = (clubName: string, username: string, password: string) => {
    modal.success({
      title: t('adminClubs.credentialsTitle'),
      width: 460,
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          <Alert type="warning" message={t('adminClubs.credentialsWarn')} showIcon />
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('adminClubs.clubName')}>{clubName}</Descriptions.Item>
            <Descriptions.Item label={t('adminClubs.adminUsername')}>
              <Text code copyable>
                {username}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('adminClubs.adminPassword')}>
              <Text code copyable>
                {password}
              </Text>
            </Descriptions.Item>
          </Descriptions>
          <Button
            icon={<CopyOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(
                `${clubName}\n${t('adminClubs.loginLabel')}: ${username}\n${t('adminClubs.passwordLabel')}: ${password}`,
              );
              message.success(t('adminClubs.copied'));
            }}
          >
            {t('adminClubs.copy')}
          </Button>
        </Space>
      ),
    });
  };

  // ---------- Yaratish ----------
  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await adminApi.createClub(values);
      setCreateOpen(false);
      createForm.resetFields();
      showCredentials(values.name, values.adminUsername, values.adminPassword);
      refreshList();
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
      refreshList();
      if (detailClub?.id === editClub.id) setDetailClub(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Uzaytirish ----------
  const doExtend = async (club: Club, body: { months?: number; until?: string }) => {
    try {
      const res = await adminApi.extend(club.id, body);
      message.success(res.message);
      refreshList();
      if (detailClub?.id === club.id) setDetailClub(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const extendMenuItems = (club: Club) => [
    { key: '1', label: t('adminClubs.extend1'), onClick: () => void doExtend(club, { months: 1 }) },
    { key: '3', label: t('adminClubs.extend3'), onClick: () => void doExtend(club, { months: 3 }) },
    { key: '6', label: t('adminClubs.extend6'), onClick: () => void doExtend(club, { months: 6 }) },
    {
      key: '12',
      label: t('adminClubs.extend12'),
      onClick: () => void doExtend(club, { months: 12 }),
    },
    { type: 'divider' as const },
    {
      key: 'custom',
      icon: <CalendarOutlined />,
      label: t('adminClubs.extendCustom'),
      onClick: () => {
        setExtendDate(null);
        setExtendClub(club);
      },
    },
  ];

  // ---------- Blok / parol / o'chirish ----------
  const handleBlockToggle = async (club: Club) => {
    try {
      const res =
        club.status === 'blocked'
          ? await adminApi.unblock(club.id)
          : await adminApi.block(club.id);
      message.success(res.message);
      refreshList();
      if (detailClub?.id === club.id) setDetailClub(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const confirmBlockToggle = (club: Club) => {
    if (club.status === 'blocked') {
      void handleBlockToggle(club);
      return;
    }
    modal.confirm({
      title: t('adminClubs.blockConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: () => handleBlockToggle(club),
    });
  };

  const handleResetPassword = async () => {
    if (!passwordClub) return;
    const values = await passwordForm.validateFields();
    try {
      const res = await adminApi.resetPassword(passwordClub.id, values.password);
      const clubName = passwordClub.name;
      setPasswordClub(null);
      passwordForm.resetFields();
      showCredentials(clubName, res.data.username, values.password);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const confirmDelete = (club: Club) => {
    modal.confirm({
      title: t('adminClubs.deleteConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await adminApi.removeClub(club.id);
          message.success(res.message);
          if (detailClub?.id === club.id) setDetailClub(null);
          refreshList();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
      },
    });
  };

  // ---------- Klub panelini ko'rish ----------
  const handleEnterClub = (club: Club) => {
    viewingClub.set(club.id, club.name);
    navigate('/dashboard');
  };

  // ---------- Batafsil drawer ----------
  const fetchDetail = useCallback(
    async (club: Club) => {
      setDetailStatsLoading(true);
      setContractsLoading(true);
      setInvoicesLoading(true);
      const [statsRes, contractsRes, invoicesRes] = await Promise.allSettled([
        adminApi.clubStats(club.id),
        adminApi.contracts(club.id),
        adminBillingApi.invoices({ clubId: club.id, limit: 100 }),
      ]);
      if (statsRes.status === 'fulfilled') setDetailStats(statsRes.value.data);
      else message.error(errorMessage(statsRes.reason, t('common.error')));
      if (contractsRes.status === 'fulfilled') setContracts(contractsRes.value.data);
      if (invoicesRes.status === 'fulfilled') setInvoices(invoicesRes.value.data);
      setDetailStatsLoading(false);
      setContractsLoading(false);
      setInvoicesLoading(false);
    },
    [message, t],
  );

  const openDetail = (club: Club, tab = 'overview') => {
    setDetailStats(null);
    setContracts([]);
    setInvoices([]);
    setDetailTab(tab);
    setDetailClub(club);
    void fetchDetail(club);
  };

  const closeDetail = () => {
    setDetailClub(null);
    contractForm.resetFields();
  };

  // ---------- Shartnomalar ----------
  const reloadContracts = async (clubId: number) => {
    setContractsLoading(true);
    try {
      const res = await adminApi.contracts(clubId);
      setContracts(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setContractsLoading(false);
    }
  };

  const handleAddContract = async () => {
    if (!detailClub) return;
    const values = await contractForm.validateFields();
    setContractSaving(true);
    try {
      const res = await adminApi.addContract(detailClub.id, {
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
      void reloadContracts(detailClub.id);
      refreshList();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setContractSaving(false);
    }
  };

  const handleRemoveContract = async (contractId: number) => {
    if (!detailClub) return;
    try {
      const res = await adminApi.removeContract(detailClub.id, contractId);
      message.success(res.message);
      void reloadContracts(detailClub.id);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const contractTypeLabel = (type: ContractType): string => t(`adminClubs.ct_${type}`);

  // ---------- Ustunlar ----------
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
      render: (s: ClubStatus) => <StatusTag status={s} label={t(`club.${s}`)} />,
    },
    {
      title: t('adminClubs.endsAt'),
      dataIndex: 'effectiveEndsAt',
      width: 210,
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
            <Tag
              color={(club.daysLeft ?? 99) <= 3 ? 'red' : (club.daysLeft ?? 99) <= 7 ? 'orange' : 'green'}
            >
              {club.daysLeft} {t('adminClubs.daysLeft')}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: t('adminClubs.createdAt'),
      dataIndex: 'createdAt',
      width: 110,
      responsive: ['lg'],
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 320,
      render: (_, club) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(club)}>
            {t('adminClubs.view')}
          </Button>
          <Dropdown menu={{ items: extendMenuItems(club) }}>
            <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
              {t('adminClubs.extend')}
            </Button>
          </Dropdown>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<LoginOutlined />}
            title={t('adminClubs.viewAsClub')}
            aria-label={t('adminClubs.viewAsClub')}
            onClick={() => handleEnterClub(club)}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'contracts',
                  icon: <FileTextOutlined />,
                  label: t('adminClubs.contractBtn'),
                  onClick: () => openDetail(club, 'contracts'),
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: t('adminClubs.editClub'),
                  onClick: () => {
                    editForm.setFieldsValue({
                      name: club.name,
                      ownerName: club.ownerName,
                      phone: club.phone,
                      address: club.address,
                      notes: club.notes,
                    });
                    setEditClub(club);
                  },
                },
                {
                  key: 'password',
                  icon: <KeyOutlined />,
                  label: t('adminClubs.resetPassword'),
                  onClick: () => setPasswordClub(club),
                },
                { type: 'divider' as const },
                club.status === 'blocked'
                  ? {
                      key: 'unblock',
                      icon: <UnlockOutlined />,
                      label: t('adminClubs.unblock'),
                      onClick: () => confirmBlockToggle(club),
                    }
                  : {
                      key: 'block',
                      icon: <LockOutlined />,
                      danger: true,
                      label: t('adminClubs.block'),
                      onClick: () => confirmBlockToggle(club),
                    },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  danger: true,
                  label: t('btn.delete'),
                  onClick: () => confirmDelete(club),
                },
              ],
            }}
          >
            <Button size="small" icon={<MoreOutlined />} aria-label={t('common.actions')} />
          </Dropdown>
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
      width: 140,
      align: 'right',
      render: (amount: number) => (
        <Text strong className="tabular-nums">
          {formatMoney(amount, t('common.sum'))}
        </Text>
      ),
    },
    {
      title: t('adminClubs.contractPeriod'),
      key: 'period',
      width: 190,
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

  const invoiceColumns: ColumnsType<Invoice> = [
    {
      title: t('adminClubs.invoiceNumber'),
      dataIndex: 'number',
      width: 160,
      render: (n: string) => <Text code>{n}</Text>,
    },
    {
      title: t('adminClubs.contractAmount'),
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (amount: number) => (
        <span className="tabular-nums">{formatMoney(amount, t('common.sum'))}</span>
      ),
    },
    {
      title: t('adminClubs.status'),
      dataIndex: 'status',
      width: 120,
      render: (s: InvoiceStatus) => (
        <StatusTag status={INVOICE_TAG_STATUS[s]} label={t(`admin.billing.st_${s}`)} />
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 120,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
  ];

  // ---------- Drawer tab tarkibi ----------
  const detailTabs = detailClub
    ? [
        {
          key: 'overview',
          label: t('adminClubs.tabOverview'),
          children: (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('adminClubs.clubName')}>
                  {detailClub.name}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.ownerName')}>
                  {detailClub.ownerName ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.phone')}>
                  {detailClub.phone ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.address')}>
                  {detailClub.address ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.adminLogin')}>
                  {detailStats?.adminUsername ? (
                    <Space size={8}>
                      <Text code copyable>
                        {detailStats.adminUsername}
                      </Text>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${detailClub.name}\n${t('adminClubs.loginLabel')}: ${detailStats.adminUsername}`,
                          );
                          message.success(t('adminClubs.copied'));
                        }}
                      >
                        {t('adminClubs.copy')}
                      </Button>
                    </Space>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.status')}>
                  <StatusTag status={detailClub.status} label={t(`club.${detailClub.status}`)} />
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.endsAt')}>
                  {detailClub.effectiveEndsAt
                    ? dayjs(detailClub.effectiveEndsAt).format('DD.MM.YYYY')
                    : t('adminClubs.noEnd')}
                </Descriptions.Item>
                <Descriptions.Item label={t('adminClubs.lastActivity')}>
                  {detailStats?.lastActivityAt
                    ? dayjs(detailStats.lastActivityAt).format('DD.MM.YYYY HH:mm')
                    : t('adminClubs.never')}
                </Descriptions.Item>
                {detailClub.notes && (
                  <Descriptions.Item label={t('adminClubs.notes')}>
                    {detailClub.notes}
                  </Descriptions.Item>
                )}
              </Descriptions>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.users')}
                    value={formatNumber(detailStats?.users ?? 0)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.tables')}
                    value={formatNumber(detailStats?.tables ?? 0)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.activeSessions')}
                    value={formatNumber(detailStats?.activeSessions ?? 0)}
                    accent={TOKENS.color.neonGreen}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.totalSessions')}
                    value={formatNumber(detailStats?.totalSessions ?? 0)}
                  />
                </Col>
                <Col span={24}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.monthlyRevenue')}
                    value={formatMoney(detailStats?.monthlyRevenue ?? 0, t('common.sum'))}
                    accent={TOKENS.color.emerald.bright}
                  />
                </Col>
                <Col span={24}>
                  <StatCard
                    loading={detailStatsLoading}
                    label={t('adminClubs.unpaidDebts')}
                    value={formatMoney(detailStats?.unpaidDebts ?? 0, t('common.sum'))}
                    accent={
                      (detailStats?.unpaidDebts ?? 0) > 0
                        ? TOKENS.color.semantic.error
                        : TOKENS.color.gold.base
                    }
                  />
                </Col>
              </Row>
            </Space>
          ),
        },
        {
          key: 'contracts',
          label: t('adminClubs.contractsTitle'),
          children: (
            <div>
              <Table
                rowKey="id"
                size="small"
                sticky
                columns={contractColumns}
                dataSource={contracts}
                loading={contractsLoading}
                pagination={false}
                scroll={{ x: 640 }}
                locale={{
                  emptyText: (
                    <EmptyState
                      title={t('adminClubs.contractsEmpty')}
                      style={{ padding: '20px 12px' }}
                    />
                  ),
                }}
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
                        options={CONTRACT_TYPES.map((v) => ({
                          value: v,
                          label: contractTypeLabel(v),
                        }))}
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
                        const currentEnd = detailClub.effectiveEndsAt
                          ? dayjs(detailClub.effectiveEndsAt)
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
            </div>
          ),
        },
        {
          key: 'invoices',
          label: t('adminClubs.tabInvoices'),
          children: (
            <Table
              rowKey="id"
              size="small"
              sticky
              columns={invoiceColumns}
              dataSource={invoices}
              loading={invoicesLoading}
              pagination={false}
              scroll={{ x: 560 }}
              locale={{
                emptyText: (
                  <EmptyState
                    title={t('adminClubs.invoicesEmpty')}
                    hint={t('adminClubs.invoicesHint')}
                    style={{ padding: '20px 12px' }}
                  />
                ),
              }}
            />
          ),
        },
      ]
    : [];

  return (
    <PageTransition>
      <PageHeader
        icon={<ShopOutlined />}
        title={t('adminClubs.title')}
        subtitle={t('adminClubs.subtitle')}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              aria-label={t('btn.refresh')}
              onClick={refreshList}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {t('adminClubs.addClub')}
            </Button>
          </Space>
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={refreshList}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      <Card>
        <Space wrap style={{ marginBottom: TOKENS.spacing.md }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: TOKENS.color.text.tertiary }} />}
            placeholder={t('adminClubs.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ width: 260 }}
          />
          <Select
            allowClear
            placeholder={t('adminClubs.statusFilter')}
            value={status}
            onChange={(v) => onStatusChange(v)}
            style={{ width: 180 }}
            options={CLUB_STATUSES.map((s) => ({ value: s, label: t(`club.${s}`) }))}
          />
        </Space>

        <Table
          rowKey="id"
          size="small"
          sticky
          columns={columns}
          dataSource={clubs}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n) => `${t('common.total')}: ${formatNumber(n)}`,
            onChange: (p, ps) => {
              const nextPage = ps !== pageSize ? 1 : p;
              setPage(nextPage);
              setPageSize(ps);
              void fetchClubs({ page: nextPage, pageSize: ps, search, status });
            },
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ShopOutlined />}
                title={t('adminClubs.emptyTitle')}
                hint={t('adminClubs.emptyHint')}
              />
            ),
          }}
        />
      </Card>

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
            <Col xs={24} sm={12}>
              <Form.Item
                name="ownerName"
                label={t('adminClubs.ownerName')}
                rules={[{ required: true, message: t('adminClubs.ownerRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label={t('adminClubs.phone')}>
                <Input maxLength={20} placeholder="+998" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="adminUsername"
                label={t('adminClubs.adminUsername')}
                rules={[
                  { required: true, min: 3, message: t('adminClubs.usernameRequired') },
                  { pattern: /^[a-zA-Z0-9_.-]+$/, message: 'a-z, 0-9, _ . -' },
                ]}
              >
                <Input maxLength={50} autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
                      onClick={() =>
                        createForm.setFieldValue('adminPassword', generatePassword())
                      }
                    >
                      {t('adminClubs.generate')}
                    </Button>
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="trialDays" label={t('adminClubs.trialDays')}>
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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

      {/* Batafsil drawer */}
      <Drawer
        title={
          detailClub && (
            <Space size={10}>
              {detailClub.name}
              <StatusTag status={detailClub.status} label={t(`club.${detailClub.status}`)} />
            </Space>
          )
        }
        open={!!detailClub}
        onClose={closeDetail}
        width="min(720px, 100vw)"
        extra={
          detailClub && (
            <Space>
              <Dropdown menu={{ items: extendMenuItems(detailClub) }}>
                <Button size="small" type="primary" icon={<ThunderboltOutlined />}>
                  {t('adminClubs.extend')}
                </Button>
              </Dropdown>
              <Button
                size="small"
                icon={<LoginOutlined />}
                onClick={() => handleEnterClub(detailClub)}
              >
                {t('adminClubs.viewAsClub')}
              </Button>
            </Space>
          )
        }
      >
        <Tabs activeKey={detailTab} onChange={setDetailTab} items={detailTabs} />
      </Drawer>
    </PageTransition>
  );
};

export default AdminClubsPage;
