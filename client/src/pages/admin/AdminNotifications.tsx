import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  GlobalOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { adminNotificationsApi, errorMessage } from '../../api';
import {
  ClampedBody,
  EmptyState,
  PageHeader,
  PageTransition,
  StatCard,
  StatusTag,
} from '../../components/ui';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_TAG_KEY,
  NOTIFICATION_TYPES,
} from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type {
  ClubNotificationType,
  ClubStatus,
  NotificationAudience,
  NotificationBatch,
  NotificationRecipient,
  NotificationStats,
} from '../../types';
import { formatDateTime, formatNumber, normalizeMessageBody } from '../../utils/format';
import ClubSelect from './ClubSelect';

const { Text, Paragraph } = Typography;

type DateRange = [Dayjs | null, Dayjs | null] | null;
type TargetFilter = 'any' | 'single' | 'broadcast';
type ComposeTarget = 'all' | 'some' | 'single';

const KNOWN_TYPES = new Set<string>(NOTIFICATION_TYPES);
const typeKeyOf = (type: string): ClubNotificationType =>
  (KNOWN_TYPES.has(type) ? type : 'info') as ClubNotificationType;

/** Yozilmagan qoralama shu yerda saqlanadi (tasodifan yopilib ketmasin) */
const DRAFT_KEY = 'adminNotifDraft';

interface ComposeFormValues {
  target: ComposeTarget;
  clubId?: number;
  clubIds?: number[];
  audience: NotificationAudience;
  includeBlocked: boolean;
  type: ClubNotificationType;
  title: string;
  body: string;
}

const EMPTY_DRAFT: ComposeFormValues = {
  target: 'all',
  audience: 'all',
  includeBlocked: false,
  type: 'info',
  title: '',
  body: '',
};

/* ------------------------------------------------- Klub ko'radigan preview */

/**
 * Klub sahifasidagi qatorning aynan nusxasi. Ikkala tomon bir xil
 * NOTIFICATION_TAG_KEY va ClampedBody dan foydalanadi — shuning uchun
 * bu "taxminan shunday" emas, balki haqiqiy ko'rinish.
 */
const NotificationPreview = ({
  type,
  title,
  body,
}: {
  type: ClubNotificationType;
  title: string;
  body: string;
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: TOKENS.radius.sm,
        background: TOKENS.color.bg.bg2,
        border: `1px solid ${TOKENS.color.gold.line}`,
        borderInlineStart: `3px solid ${TOKENS.color.gold.base}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: TOKENS.spacing.xs,
          minWidth: 0,
        }}
      >
        <Text
          strong
          style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {title}
        </Text>
        <StatusTag status="unread" label={t('notifications.newBadge')} dot />
        <StatusTag
          status={NOTIFICATION_TAG_KEY[type]}
          label={t(`notifications.type.${type}`)}
          dot={false}
        />
        <Text type="secondary" className="tabular-nums" style={{ fontSize: 12 }}>
          {formatDateTime(new Date())}
        </Text>
      </div>
      <ClampedBody
        text={body}
        rows={3}
        expandLabel={t('notifications.expand')}
        collapseLabel={t('notifications.collapse')}
        style={{ marginTop: 6 }}
      />
    </div>
  );
};

/* ------------------------------------------------------------- Yozish oynasi */

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  /** "Nusxasini yuborish" orqali oldindan to'ldirish */
  prefill: Partial<ComposeFormValues> | null;
}

const ComposeDrawer = ({ open, onClose, onSent, prefill }: ComposeDrawerProps) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ComposeFormValues>();

  const target = Form.useWatch('target', form);
  const audience = Form.useWatch('audience', form);
  const includeBlocked = Form.useWatch('includeBlocked', form);
  const clubIds = Form.useWatch('clubIds', form);
  const type = Form.useWatch('type', form);
  const title = Form.useWatch('title', form);
  const body = Form.useWatch('body', form);

  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  /** Ikki marta bosishdan qat'iy qulf — fan-out ikki marta ketmasin */
  const sendingRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Oyna ochilganda: prefill > saqlangan qoralama > bo'sh forma
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      form.setFieldsValue({ ...EMPTY_DRAFT, ...prefill });
      setDraftRestored(false);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft = raw ? (JSON.parse(raw) as Partial<ComposeFormValues>) : null;
      if (draft && (draft.title || draft.body)) {
        form.setFieldsValue({ ...EMPTY_DRAFT, ...draft });
        setDraftRestored(true);
        return;
      }
    } catch {
      // Buzilgan qoralama — e'tiborsiz qoldiriladi
    }
    form.setFieldsValue(EMPTY_DRAFT);
    setDraftRestored(false);
  }, [open, prefill, form]);

  useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      if (countTimerRef.current) clearTimeout(countTimerRef.current);
    },
    [],
  );

  // Qabul qiluvchilar sonini jonli hisoblash.
  // Taymerni tozalash SHARTLARDAN OLDIN: `destroyOnHidden` sababli oyna
  // birinchi ochilganda `target` bir renderga `undefined` bo'ladi va
  // "auditoriya" so'rovi qo'yib yuboriladi — target keyin 'single' ga
  // o'tsa, kechikkan javob 1 ni platforma bo'ylab songa almashtirardi.
  useEffect(() => {
    if (countTimerRef.current) clearTimeout(countTimerRef.current);
    if (!open) return;

    if (target === 'single') {
      setRecipientCount(1);
      return;
    }
    if (target === 'some') {
      setRecipientCount(clubIds?.length ?? 0);
      return;
    }

    let alive = true;
    countTimerRef.current = setTimeout(() => {
      adminNotificationsApi
        .audienceCount({ audience, includeBlocked })
        .then((res) => {
          if (alive) setRecipientCount(res.count ?? 0);
        })
        .catch(() => {
          if (alive) setRecipientCount(null);
        });
    }, 300);

    return () => {
      alive = false;
    };
  }, [open, target, audience, includeBlocked, clubIds]);

  const saveDraft = () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const values = form.getFieldsValue();
      if (!values.title && !values.body) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    }, 500);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    form.setFieldsValue(EMPTY_DRAFT);
    setDraftRestored(false);
  };

  const doSend = async (values: ComposeFormValues) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const res = await adminNotificationsApi.send({
        title: values.title.trim(),
        body: values.body.trim(),
        type: values.type,
        clubId: values.target === 'single' ? values.clubId : undefined,
        clubIds: values.target === 'some' ? values.clubIds : undefined,
        audience: values.target === 'all' ? values.audience : undefined,
        includeBlocked: values.target === 'all' ? values.includeBlocked : undefined,
      });
      message.success(res.message ?? t('admin.notif.sent'));
      localStorage.removeItem(DRAFT_KEY);
      form.resetFields();
      setDraftRestored(false);
      onSent();
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleFinish = (values: ComposeFormValues) => {
    // Bitta klub — tasdiqsiz. Ommaviy e'lon — aniq son bilan tasdiq.
    if (values.target === 'single') {
      void doSend(values);
      return;
    }
    const count =
      values.target === 'some' ? (values.clubIds?.length ?? 0) : (recipientCount ?? 0);

    modal.confirm({
      title: t('admin.notif.sendConfirmCount', { count }),
      width: 520,
      icon: null,
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      content: (
        <div style={{ marginTop: TOKENS.spacing.sm }}>
          <NotificationPreview
            type={values.type}
            title={values.title.trim()}
            body={values.body.trim()}
          />
        </div>
      ),
      onOk: () => doSend(values),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      destroyOnHidden
      width="min(720px, 100vw)"
      title={
        <Space size={8}>
          <SendOutlined style={{ color: TOKENS.color.gold.base }} />
          {t('admin.notif.composeTitle')}
        </Space>
      }
      footer={
        <Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sending}
            onClick={() => form.submit()}
          >
            {t('admin.notif.send')}
          </Button>
          <Button type="text" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
        </Space>
      }
    >
      {draftRestored && (
        <Alert
          type="info"
          showIcon
          closable
          style={{ marginBottom: TOKENS.spacing.md }}
          message={t('admin.notif.draftRestored')}
          action={
            <Button size="small" onClick={discardDraft}>
              {t('admin.notif.draftDiscard')}
            </Button>
          }
        />
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={EMPTY_DRAFT}
        onValuesChange={saveDraft}
        onFinish={handleFinish}
      >
        <Form.Item name="target" label={t('admin.notif.target')}>
          <Radio.Group>
            <Radio.Button value="all">
              <GlobalOutlined /> {t('admin.notif.targetAll')}
            </Radio.Button>
            <Radio.Button value="some">
              <UsergroupAddOutlined /> {t('admin.notif.targetMany')}
            </Radio.Button>
            <Radio.Button value="single">
              <BellOutlined /> {t('admin.notif.targetOne')}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        {target === 'all' && (
          <Row gutter={12}>
            <Col xs={24} sm={14}>
              <Form.Item name="audience" label={t('admin.notif.audience')}>
                <Select
                  options={NOTIFICATION_AUDIENCES.map((value) => ({
                    value,
                    label: t(`admin.notif.audience${value.charAt(0).toUpperCase()}${value.slice(1)}`),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item
                name="includeBlocked"
                valuePropName="checked"
                label=" "
                /* Bo'sh label — checkbox Select bilan bir chiziqda tursin */
              >
                <Checkbox disabled={audience !== 'all'}>
                  {t('admin.notif.includeBlocked')}
                </Checkbox>
              </Form.Item>
            </Col>
          </Row>
        )}

        {target === 'some' && (
          <Form.Item
            name="clubIds"
            label={t('admin.notif.selectClubs')}
            rules={[{ required: true, message: t('admin.notif.clubsRequired') }]}
          >
            <ClubSelect multiple placeholder={t('admin.notif.selectClubs')} style={{ width: '100%' }} />
          </Form.Item>
        )}

        {target === 'single' && (
          <Form.Item
            name="clubId"
            label={t('admin.notif.selectClub')}
            rules={[{ required: true, message: t('admin.notif.clubRequired') }]}
          >
            <ClubSelect placeholder={t('admin.notif.selectClub')} style={{ width: '100%' }} />
          </Form.Item>
        )}

        <Alert
          type={recipientCount === 0 ? 'warning' : 'info'}
          showIcon
          icon={<TeamOutlined />}
          style={{ marginBottom: TOKENS.spacing.md }}
          message={
            recipientCount === null
              ? t('common.loading')
              : t('admin.notif.audienceCount', { count: recipientCount })
          }
        />

        <Form.Item name="type" label={t('admin.notif.type')}>
          <Select
            options={NOTIFICATION_TYPES.map((value) => ({
              value,
              label: t(`admin.notif.type_${value}`),
            }))}
          />
        </Form.Item>

        <Form.Item
          name="title"
          label={t('admin.notif.messageTitle')}
          extra={t('admin.notif.titleHint')}
          rules={[
            { required: true, whitespace: true, message: t('admin.notif.titleRequired') },
            { min: 3, message: t('admin.notif.titleMin') },
          ]}
        >
          <Input maxLength={200} showCount />
        </Form.Item>

        <Form.Item
          name="body"
          label={t('admin.notif.body')}
          extra={t('admin.notif.bodyHint')}
          rules={[
            { required: true, whitespace: true, message: t('admin.notif.bodyRequired') },
            { min: 10, message: t('admin.notif.bodyMin') },
          ]}
        >
          <Input.TextArea rows={7} maxLength={5000} showCount />
        </Form.Item>
      </Form>

      <Card size="small" title={t('admin.notif.preview')}>
        {title || body ? (
          <NotificationPreview
            type={type ?? 'info'}
            title={title ?? ''}
            body={body ?? ''}
          />
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('admin.notif.previewEmpty')}
          </Text>
        )}
      </Card>
    </Drawer>
  );
};

/* ---------------------------------------------------------- E'lon tafsiloti */

interface BatchDrawerProps {
  batchId: string | null;
  onClose: () => void;
  /** Qaytarib olingandan keyin tarixni yangilash */
  onChanged: () => void;
  onDuplicate: (batch: NotificationBatch) => void;
}

const BatchDetailDrawer = ({ batchId, onClose, onChanged, onDuplicate }: BatchDrawerProps) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();

  const [batch, setBatch] = useState<NotificationBatch | null>(null);
  const [loading, setLoading] = useState(false);

  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsTotal, setRecipientsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'read' | 'unread'>('all');
  const [search, setSearch] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(true);
  const [recalling, setRecalling] = useState(false);

  /** Ochiq e'lon — kech kelgan javob boshqasini bosib ketmasin */
  const activeRef = useRef<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const loadRecipients = useCallback(
    async (id: string, params: { page: number; status: 'all' | 'read' | 'unread'; search: string }) => {
      setRecipientsLoading(true);
      try {
        const res = await adminNotificationsApi.recipients(id, {
          page: params.page,
          limit: 20,
          status: params.status === 'all' ? undefined : params.status,
          search: params.search || undefined,
        });
        if (activeRef.current !== id) return;
        setRecipients(res.data);
        setRecipientsTotal(res.pagination?.total ?? res.data.length);
      } catch {
        if (activeRef.current === id) setRecipients([]);
      } finally {
        if (activeRef.current === id) setRecipientsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!batchId) {
      activeRef.current = null;
      setBatch(null);
      return;
    }

    activeRef.current = batchId;
    setLoading(true);
    setBatch(null);
    setRecipients([]);
    setPage(1);
    setStatus('all');
    setSearch('');
    setOnlyUnread(true);

    adminNotificationsApi
      .batch(batchId)
      .then((res) => {
        if (activeRef.current !== batchId) return;
        setBatch(res.data);
      })
      .catch((err) => {
        if (activeRef.current !== batchId) return;
        message.error(errorMessage(err, tRef.current('common.error')));
        onClose();
      })
      .finally(() => {
        if (activeRef.current === batchId) setLoading(false);
      });

    void loadRecipients(batchId, { page: 1, status: 'all', search: '' });
    // onClose/message barqaror emas — faqat batchId o'zgarishiga reaksiya
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, loadRecipients]);

  const handleRecall = () => {
    if (!batch) return;
    modal.confirm({
      title: t('admin.notif.recall'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      content: t('admin.notif.recallConfirm', {
        recipients: batch.recipients,
        read: batch.readCount,
      }),
      onOk: async () => {
        setRecalling(true);
        try {
          const res = await adminNotificationsApi.recall(batch.batchId, onlyUnread);
          message.success(res.message ?? t('admin.notif.recalled'));
          onChanged();
          onClose();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        } finally {
          setRecalling(false);
        }
      },
    });
  };

  const recipientColumns: ColumnsType<NotificationRecipient> = [
    {
      title: t('admin.notif.club'),
      dataIndex: 'clubName',
      ellipsis: true,
      render: (name: string, row) => <Text>{name || `#${row.clubId}`}</Text>,
    },
    {
      title: t('admin.notif.clubStatus'),
      dataIndex: 'clubStatus',
      width: 120,
      render: (s: ClubStatus) => <StatusTag status={s} label={t(`club.${s}`)} />,
    },
    {
      title: t('admin.notif.readStatus'),
      dataIndex: 'readAt',
      width: 170,
      render: (readAt: string | null) =>
        readAt ? (
          <Text type="secondary" className="tabular-nums" style={{ fontSize: 12.5 }}>
            {formatDateTime(readAt)}
          </Text>
        ) : (
          <StatusTag status="warning" label={t('admin.notif.unread')} dot />
        ),
    },
  ];

  const typeKey = batch ? typeKeyOf(batch.type) : 'info';

  return (
    <Drawer
      open={batchId !== null}
      onClose={onClose}
      loading={loading}
      width="min(760px, 100vw)"
      title={
        batch && (
          <Space size={10} wrap>
            <span style={{ overflowWrap: 'anywhere' }}>{batch.title}</span>
            <StatusTag
              status={NOTIFICATION_TAG_KEY[typeKey]}
              label={t(`admin.notif.type_${typeKey}`)}
              dot={false}
            />
          </Space>
        )
      }
      extra={
        batch && (
          <Button icon={<CopyOutlined />} onClick={() => onDuplicate(batch)}>
            {t('admin.notif.duplicate')}
          </Button>
        )
      }
    >
      {batch && (
        <Space direction="vertical" size={TOKENS.spacing.md} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('admin.notif.sender')}>
              {batch.createdByName ?? t('admin.notif.unknownSender')}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin.notif.sentAt')}>
              <span className="tabular-nums">{formatDateTime(batch.createdAt)}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t('admin.notif.recipients')}>
              {batch.recipients === 1 ? (
                <Text>{batch.clubName ?? `#${batch.clubId}`}</Text>
              ) : (
                <Tag>{t('admin.notif.targetCount', { count: batch.recipients })}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin.notif.readRate')}>
              <Space size={10} style={{ width: '100%' }}>
                <Text className="tabular-nums">
                  {formatNumber(batch.readCount)} / {formatNumber(batch.recipients)}
                </Text>
                <Progress
                  percent={batch.readRatePercent}
                  size="small"
                  style={{ width: 160, marginBottom: 0 }}
                  strokeColor={TOKENS.color.emerald.bright}
                />
              </Space>
            </Descriptions.Item>
          </Descriptions>

          {/* To'liq matn — yuboruvchi qabul qiluvchidan kam ko'rmasin */}
          <Card size="small" title={t('admin.notif.body')}>
            <Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                maxWidth: '68ch',
                marginBottom: 0,
                lineHeight: 1.65,
              }}
            >
              {normalizeMessageBody(batch.body)}
            </Paragraph>
          </Card>

          <Card
            size="small"
            title={t('admin.notif.recipientsTitle')}
            extra={
              <Space size={8} wrap>
                <Input
                  allowClear
                  size="small"
                  prefix={<SearchOutlined />}
                  placeholder={t('admin.notif.filterClub')}
                  style={{ width: 160 }}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearch(value);
                    setPage(1);
                    void loadRecipients(batch.batchId, { page: 1, status, search: value });
                  }}
                />
                <Select
                  size="small"
                  value={status}
                  style={{ width: 140 }}
                  onChange={(value) => {
                    setStatus(value);
                    setPage(1);
                    void loadRecipients(batch.batchId, { page: 1, status: value, search });
                  }}
                  options={[
                    { value: 'all', label: t('common.all') },
                    { value: 'unread', label: t('admin.notif.unread') },
                    { value: 'read', label: t('admin.notif.read') },
                  ]}
                />
              </Space>
            }
          >
            <Table
              rowKey="id"
              size="small"
              columns={recipientColumns}
              dataSource={recipients}
              loading={recipientsLoading}
              scroll={{ x: 480 }}
              pagination={{
                current: page,
                pageSize: 20,
                total: recipientsTotal,
                showSizeChanger: false,
                showTotal: (n) => `${t('common.total')}: ${formatNumber(n)}`,
                onChange: (nextPage) => {
                  setPage(nextPage);
                  void loadRecipients(batch.batchId, { page: nextPage, status, search });
                },
              }}
            />
          </Card>

          {/* Qaytarib olish */}
          <Card
            size="small"
            title={t('admin.notif.recall')}
            style={{ borderColor: 'color-mix(in srgb, ' + TOKENS.color.semantic.error + ' 30%, transparent)' }}
          >
            <Space direction="vertical" size={TOKENS.spacing.sm} style={{ width: '100%' }}>
              <Space size={10}>
                <Switch checked={onlyUnread} onChange={setOnlyUnread} />
                <Text style={{ fontSize: 13 }}>{t('admin.notif.recallOnlyUnread')}</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {t('admin.notif.recallHint')}
              </Text>
              <Button danger icon={<DeleteOutlined />} loading={recalling} onClick={handleRecall}>
                {t('admin.notif.recall')}
              </Button>
            </Space>
          </Card>
        </Space>
      )}
    </Drawer>
  );
};

/* --------------------------------------------------------------- Asosiy sahifa */

interface HistoryParams {
  page: number;
  pageSize: number;
  type?: string;
  clubId?: number;
  search: string;
  range: DateRange;
  target: TargetFilter;
}

/**
 * Superadmin xabarnomalari — yuborish oynasi, E'LON (batch) bo'yicha
 * guruhlangan tarix, yetkazish/o'qish statistikasi va qaytarib olish.
 */
const AdminNotifications = () => {
  const { t } = useTranslation();

  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [history, setHistory] = useState<NotificationBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [clubFilter, setClubFilter] = useState<number | undefined>(undefined);
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('any');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<ComposeFormValues> | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda tarix
  // 1-sahifaga jimgina qaytib ketmasin
  const tRef = useRef(t);
  tRef.current = t;

  const reqIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await adminNotificationsApi.stats();
      setStats(res.data);
    } catch {
      // Ko'rsatkichlar ikkilamchi — xatoda jim qolamiz
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (params: HistoryParams) => {
    const reqId = ++reqIdRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [from, to] = params.range ?? [null, null];
      const res = await adminNotificationsApi.history({
        page: params.page,
        limit: params.pageSize,
        type: params.type,
        clubId: params.clubId,
        search: params.search || undefined,
        target: params.target === 'any' ? undefined : params.target,
        from: from ? from.format('YYYY-MM-DD') : undefined,
        to: to ? to.format('YYYY-MM-DD') : undefined,
      });
      if (reqId !== reqIdRef.current) return;
      setHistory(res.data);
      setTotal(res.pagination?.total ?? res.data.length);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setHistoryError(errorMessage(err, tRef.current('common.error')));
    } finally {
      if (reqId === reqIdRef.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    void fetchHistory({ page: 1, pageSize: 20, search: '', range: null, target: 'any' });
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [fetchStats, fetchHistory]);

  /** Joriy filtrlar bilan qayta yuklash */
  const refresh = useCallback(() => {
    void fetchStats();
    void fetchHistory({
      page,
      pageSize,
      type: typeFilter,
      clubId: clubFilter,
      search,
      range,
      target: targetFilter,
    });
  }, [fetchStats, fetchHistory, page, pageSize, typeFilter, clubFilter, search, range, targetFilter]);

  /** Filtr o'zgarishi — qiymatlar ANIQ uzatiladi (eskirgan closure bo'lmasin) */
  const applyFilters = (next: Partial<HistoryParams>) => {
    const merged: HistoryParams = {
      page: 1,
      pageSize,
      type: typeFilter,
      clubId: clubFilter,
      search,
      range,
      target: targetFilter,
      ...next,
    };
    if ('type' in next) setTypeFilter(next.type);
    if ('clubId' in next) setClubFilter(next.clubId);
    if (next.search !== undefined) setSearch(next.search);
    if ('range' in next) setRange(next.range ?? null);
    if (next.target !== undefined) setTargetFilter(next.target);
    setPage(1);
    void fetchHistory(merged);
  };

  const handleDuplicate = (batch: NotificationBatch) => {
    setDetailBatchId(null);
    setPrefill({
      target: batch.recipients === 1 && batch.clubId ? 'single' : 'all',
      clubId: batch.clubId ?? undefined,
      type: typeKeyOf(batch.type),
      title: batch.title,
      body: batch.body,
    });
    setComposeOpen(true);
  };

  const openCompose = () => {
    setPrefill(null);
    setComposeOpen(true);
  };

  const columns: ColumnsType<NotificationBatch> = [
    {
      title: t('admin.notif.sentAt'),
      dataIndex: 'createdAt',
      width: 145,
      render: (d: string) => (
        <Text className="tabular-nums" style={{ fontSize: 12.5 }}>
          {dayjs(d).format('DD.MM.YYYY HH:mm')}
        </Text>
      ),
    },
    {
      title: t('admin.notif.type'),
      dataIndex: 'type',
      width: 130,
      render: (type: string) => {
        const key = typeKeyOf(type);
        return (
          <StatusTag
            status={NOTIFICATION_TAG_KEY[key]}
            label={t(`admin.notif.type_${key}`)}
            dot={false}
          />
        );
      },
    },
    {
      title: t('admin.notif.messageTitle'),
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, row) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%', minWidth: 0 }}>
          <Text strong ellipsis style={{ maxWidth: 340 }}>
            {title}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {normalizeMessageBody(row.body).replace(/\n+/g, ' ')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('admin.notif.target'),
      key: 'target',
      width: 170,
      render: (_, row) =>
        row.recipients === 1 ? (
          <Text ellipsis style={{ maxWidth: 150 }}>
            {row.clubName ?? `#${row.clubId}`}
          </Text>
        ) : (
          <Tag color="gold">{t('admin.notif.targetCount', { count: row.recipients })}</Tag>
        ),
    },
    {
      title: t('admin.notif.readCount'),
      key: 'read',
      width: 180,
      responsive: ['md'],
      render: (_, row) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Text className="tabular-nums" style={{ fontSize: 12.5 }}>
            {formatNumber(row.readCount)} / {formatNumber(row.recipients)} ({row.readRatePercent}%)
          </Text>
          <Progress
            percent={row.readRatePercent}
            size="small"
            showInfo={false}
            strokeColor={TOKENS.color.emerald.bright}
            style={{ marginBottom: 0 }}
          />
        </Space>
      ),
    },
    {
      title: t('admin.notif.sender'),
      dataIndex: 'createdByName',
      width: 140,
      responsive: ['xl'],
      render: (name: string | null) => name ?? t('admin.notif.unknownSender'),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<NotificationOutlined />}
        title={t('admin.notif.title')}
        subtitle={t('admin.notif.subtitle')}
        extra={
          <>
            <Tooltip title={t('btn.refresh')}>
              <Button icon={<ReloadOutlined />} aria-label={t('btn.refresh')} onClick={refresh} />
            </Tooltip>
            <Button type="primary" icon={<SendOutlined />} onClick={openCompose}>
              {t('admin.notif.composeOpen')}
            </Button>
          </>
        }
        stats={
          <Row gutter={[16, 16]}>
            <Col xs={12} lg={6}>
              {/* Tooltipda — oxirgi 30 kunlik kesim (StatCard trend maydoni
                  foizga mo'ljallangan, bu yerda esa mutlaq son kerak) */}
              <Tooltip
                title={`${t('admin.notif.stat30d')}: ${formatNumber(stats?.batches30d ?? 0)}`}
              >
                <div>
                  <StatCard
                    label={t('admin.notif.statBatches')}
                    value={formatNumber(stats?.batches ?? 0)}
                    icon={<NotificationOutlined />}
                    loading={statsLoading}
                  />
                </div>
              </Tooltip>
            </Col>
            <Col xs={12} lg={6}>
              <Tooltip
                title={`${t('admin.notif.stat30d')}: ${formatNumber(stats?.recipients30d ?? 0)}`}
              >
                <div>
                  <StatCard
                    label={t('admin.notif.statRecipients')}
                    value={formatNumber(stats?.recipients ?? 0)}
                    icon={<TeamOutlined />}
                    accent={TOKENS.color.semantic.info}
                    loading={statsLoading}
                  />
                </div>
              </Tooltip>
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label={t('admin.notif.statRead')}
                value={formatNumber(stats?.read ?? 0)}
                icon={<CheckCircleOutlined />}
                accent={TOKENS.color.semantic.success}
                loading={statsLoading}
              />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label={t('admin.notif.statReadRate')}
                value={`${stats?.readRatePercent ?? 0}%`}
                icon={<CheckCircleOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={statsLoading}
              />
            </Col>
          </Row>
        }
      />

      {historyError && (
        <Alert
          type="error"
          showIcon
          message={historyError}
          action={
            <Button size="small" onClick={refresh}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      <Card title={t('admin.notif.historyTitle')}>
        <Space wrap size={TOKENS.spacing.xs} style={{ marginBottom: TOKENS.spacing.md }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('admin.notif.searchPlaceholder')}
            value={searchInput}
            style={{ width: 240 }}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(
                () => applyFilters({ search: value.trim() }),
                400,
              );
            }}
          />
          <Select
            allowClear
            value={typeFilter}
            placeholder={t('admin.notif.filterType')}
            style={{ width: 170 }}
            onChange={(value) => applyFilters({ type: value })}
            options={NOTIFICATION_TYPES.map((value) => ({
              value,
              label: t(`admin.notif.type_${value}`),
            }))}
          />
          <ClubSelect
            value={clubFilter}
            placeholder={t('admin.notif.filterClub')}
            style={{ width: 210 }}
            onChange={(value) => applyFilters({ clubId: value })}
          />
          <Select
            value={targetFilter}
            style={{ width: 170 }}
            onChange={(value: TargetFilter) => applyFilters({ target: value })}
            options={[
              { value: 'any', label: t('admin.notif.targetAny') },
              { value: 'single', label: t('admin.notif.targetSingleOnly') },
              { value: 'broadcast', label: t('admin.notif.targetBroadcast') },
            ]}
          />
          <DatePicker.RangePicker
            format="DD.MM.YYYY"
            allowEmpty={[true, true]}
            value={range}
            onChange={(value) => applyFilters({ range: value as DateRange })}
          />
        </Space>

        <Table
          rowKey="batchId"
          size="small"
          sticky
          columns={columns}
          dataSource={history}
          loading={historyLoading}
          onRow={(row) => ({
            onClick: () => setDetailBatchId(row.batchId),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n) => `${t('common.total')}: ${formatNumber(n)}`,
            onChange: (nextPage, nextSize) => {
              const targetPage = nextSize !== pageSize ? 1 : nextPage;
              setPage(targetPage);
              setPageSize(nextSize);
              void fetchHistory({
                page: targetPage,
                pageSize: nextSize,
                type: typeFilter,
                clubId: clubFilter,
                search,
                range,
                target: targetFilter,
              });
            },
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<NotificationOutlined />}
                title={t('admin.notif.historyEmpty')}
                hint={t('admin.notif.historyEmptyHint')}
              />
            ),
          }}
        />
      </Card>

      <ComposeDrawer
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={() => {
          setPage(1);
          void fetchStats();
          void fetchHistory({
            page: 1,
            pageSize,
            type: typeFilter,
            clubId: clubFilter,
            search,
            range,
            target: targetFilter,
          });
        }}
        prefill={prefill}
      />

      <BatchDetailDrawer
        batchId={detailBatchId}
        onClose={() => setDetailBatchId(null)}
        onChanged={refresh}
        onDuplicate={handleDuplicate}
      />
    </PageTransition>
  );
};

export default AdminNotifications;
