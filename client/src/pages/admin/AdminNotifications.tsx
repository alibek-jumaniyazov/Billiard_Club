import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BellOutlined,
  GlobalOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { adminNotificationsApi, errorMessage } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../../components/ui';
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_COLORS } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { ClubNotification, ClubNotificationType } from '../../types';
import { formatNumber } from '../../utils/format';
import ClubSelect from './ClubSelect';

const { Text } = Typography;

interface ComposeFormValues {
  target: 'all' | 'single';
  clubId?: number;
  type: ClubNotificationType;
  title: string;
  body: string;
}

/**
 * Superadmin xabarnomalari — bitta klubga yoki barcha bloklanmagan
 * klublarga xabar yuborish (fan-out) va yuborilganlar tarixi.
 */
const AdminNotifications = () => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ComposeFormValues>();
  const target = Form.useWatch('target', form);

  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState<ClubNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchHistory = useCallback(
    async (params: { page: number; pageSize: number }) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await adminNotificationsApi.history({
          page: params.page,
          limit: params.pageSize,
        });
        setHistory(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
      } catch (err) {
        setHistoryError(errorMessage(err, t('common.error')));
      } finally {
        setHistoryLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchHistory({ page: 1, pageSize: 20 });
  }, [fetchHistory]);

  const doSend = async (values: ComposeFormValues) => {
    setSending(true);
    try {
      const res = await adminNotificationsApi.send({
        title: values.title.trim(),
        body: values.body.trim(),
        type: values.type,
        clubId: values.target === 'single' ? values.clubId : undefined,
      });
      message.success(
        values.target === 'all'
          ? t('admin.notif.sentToAll', { count: res.count ?? 0 })
          : (res.message ?? t('admin.notif.sent')),
      );
      form.resetFields();
      form.setFieldsValue({ target: 'all', type: 'info' });
      setPage(1);
      void fetchHistory({ page: 1, pageSize });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (values.target === 'all') {
      modal.confirm({
        title: t('admin.notif.sendConfirmAll'),
        okText: t('common.yes'),
        cancelText: t('common.no'),
        onOk: () => doSend(values),
      });
    } else {
      void doSend(values);
    }
  };

  const columns: ColumnsType<ClubNotification> = [
    {
      title: t('admin.notif.sentAt'),
      dataIndex: 'createdAt',
      width: 140,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('admin.notif.club'),
      key: 'club',
      width: 180,
      render: (_, n) => <Text strong>{n.club?.name ?? `#${n.clubId}`}</Text>,
    },
    {
      title: t('admin.notif.type'),
      dataIndex: 'type',
      width: 130,
      render: (type: string) => (
        <Tag color={NOTIFICATION_TYPE_COLORS[type as ClubNotificationType] ?? 'default'}>
          {t(`admin.notif.type_${type}`, { defaultValue: type })}
        </Tag>
      ),
    },
    {
      title: t('admin.notif.messageTitle'),
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, n) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
          <Text strong ellipsis style={{ maxWidth: 300 }}>
            {title}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {n.body}
          </Text>
        </Space>
      ),
    },
    {
      title: t('admin.notif.readStatus'),
      dataIndex: 'readAt',
      width: 130,
      render: (readAt: string | null) => (
        <StatusTag
          status={readAt ? 'success' : 'warning'}
          label={readAt ? t('admin.notif.read') : t('admin.notif.unread')}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<NotificationOutlined />}
        title={t('admin.notif.title')}
        subtitle={t('admin.notif.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            aria-label={t('btn.refresh')}
            onClick={() => void fetchHistory({ page, pageSize })}
          />
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card
            title={
              <Space size={8}>
                <SendOutlined style={{ color: TOKENS.color.gold.base }} />
                {t('admin.notif.composeTitle')}
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{ target: 'all', type: 'info' }}
              onFinish={() => void handleSubmit()}
            >
              <Form.Item name="target" label={t('admin.notif.target')}>
                <Radio.Group>
                  <Radio.Button value="all">
                    <GlobalOutlined /> {t('admin.notif.targetAll')}
                  </Radio.Button>
                  <Radio.Button value="single">
                    <BellOutlined /> {t('admin.notif.targetOne')}
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>

              {target === 'single' && (
                <Form.Item
                  name="clubId"
                  label={t('admin.notif.selectClub')}
                  rules={[{ required: true, message: t('admin.notif.clubRequired') }]}
                >
                  <ClubSelect placeholder={t('admin.notif.selectClub')} style={{ width: '100%' }} />
                </Form.Item>
              )}

              <Form.Item name="type" label={t('admin.notif.type')}>
                <Select
                  options={NOTIFICATION_TYPES.map((type) => ({
                    value: type,
                    label: t(`admin.notif.type_${type}`),
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="title"
                label={t('admin.notif.messageTitle')}
                rules={[{ required: true, message: t('admin.notif.titleRequired') }]}
              >
                <Input maxLength={200} showCount />
              </Form.Item>

              <Form.Item
                name="body"
                label={t('admin.notif.body')}
                rules={[{ required: true, message: t('admin.notif.bodyRequired') }]}
              >
                <Input.TextArea rows={5} maxLength={5000} showCount />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                block
                icon={<SendOutlined />}
                loading={sending}
              >
                {t('admin.notif.send')}
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card title={t('admin.notif.historyTitle')}>
            {historyError && (
              <Alert
                type="error"
                showIcon
                message={historyError}
                action={
                  <Button size="small" onClick={() => void fetchHistory({ page, pageSize })}>
                    {t('admin.retry')}
                  </Button>
                }
                style={{ marginBottom: TOKENS.spacing.md }}
              />
            )}
            <Table
              rowKey="id"
              size="small"
              sticky
              columns={columns}
              dataSource={history}
              loading={historyLoading}
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
                  void fetchHistory({ page: nextPage, pageSize: ps });
                },
              }}
              scroll={{ x: 820 }}
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
        </Col>
      </Row>
    </PageTransition>
  );
};

export default AdminNotifications;
