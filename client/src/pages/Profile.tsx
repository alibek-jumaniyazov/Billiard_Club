import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DesktopOutlined,
  LaptopOutlined,
  LockOutlined,
  MobileOutlined,
  ReloadOutlined,
  SafetyOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { authApi, errorMessage } from '../api';
import { tokenStore } from '../api/client';
import {
  EmptyState,
  PageHeader,
  PageTransition,
  StatusTag,
} from '../components/ui';
import { ROLE_COLORS, ROLE_TAG_COLORS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { AuthDeviceSession, ChangePasswordPayload } from '../types';

const { Text } = Typography;
const { emerald, text, border } = TOKENS.color;

interface PasswordForm extends ChangePasswordPayload {
  confirmPassword: string;
}

/** User-Agent satridan qisqa qurilma yorlig'i (brauzer · OT) */
const deviceLabel = (ua: string | null): string => {
  if (!ua) return '';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('OPR/') || ua.includes('Opera')
      ? 'Opera'
      : ua.includes('Firefox/')
        ? 'Firefox'
        : ua.includes('Chrome/')
          ? 'Chrome'
          : ua.includes('Safari/')
            ? 'Safari'
            : '';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad/i.test(ua)
        ? 'iOS'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
};

const isMobileUA = (ua: string | null): boolean => !!ua && /Mobile|Android|iPhone/i.test(ua);

/**
 * Profil sahifasi (barcha rollar): shaxsiy ma'lumotlar, parolni almashtirish
 * va faol qurilmalar (refresh sessiyalar) ro'yxati — bittalab yoki barchasini
 * (joriy qurilmadan tashqari) bekor qilish mumkin.
 */
const Profile = () => {
  const { t } = useTranslation();
  const { user, club } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordForm>();

  const [changing, setChanging] = useState(false);
  const [sessions, setSessions] = useState<AuthDeviceSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [revokingJti, setRevokingJti] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchSessions = useCallback(async () => {
    setSessionsError(false);
    setSessions(null);
    try {
      const res = await authApi.sessions();
      setSessions(res.data);
    } catch {
      setSessionsError(true);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleChangePassword = async (values: PasswordForm) => {
    setChanging(true);
    try {
      const res = await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Parol almashgach eski access token bekor bo'ladi — yangisini saqlaymiz
      if (res.data?.accessToken) tokenStore.set(res.data.accessToken);
      message.success(res.message || t('profile.passwordChanged'));
      form.resetFields();
      // Boshqa qurilmalardagi sessiyalar bekor qilindi — ro'yxatni yangilaymiz
      await fetchSessions();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setChanging(false);
    }
  };

  const handleRevoke = async (session: AuthDeviceSession) => {
    setRevokingJti(session.jti);
    try {
      const res = await authApi.revokeSession(session.jti);
      message.success(res.message || t('profile.revoked'));
      await fetchSessions();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setRevokingJti(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokingOthers(true);
    try {
      const res = await authApi.revokeOtherSessions();
      message.success(t('profile.revokedOthers', { n: res.data?.revoked ?? 0 }));
      await fetchSessions();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setRevokingOthers(false);
    }
  };

  if (!user) return null;

  const infoRows: Array<{ label: string; value: ReactNode }> = [
    { label: t('profile.name'), value: <Text strong>{user.name}</Text> },
    { label: t('profile.username'), value: <Text code>{user.username}</Text> },
    {
      label: t('profile.role'),
      value: <Tag color={ROLE_TAG_COLORS[user.role]}>{t(`role.${user.role}`)}</Tag>,
    },
    ...(club ? [{ label: t('profile.club'), value: <Text strong>{club.name}</Text> }] : []),
    {
      label: t('profile.lastLogin'),
      value: user.lastLogin ? (
        <span className="tabular-nums">{dayjs(user.lastLogin).format('DD.MM.YYYY HH:mm')}</span>
      ) : (
        '—'
      ),
    },
  ];

  const sessionColumns: ColumnsType<AuthDeviceSession> = [
    {
      title: t('profile.colDevice'),
      key: 'device',
      render: (_, s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: TOKENS.radius.sm,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              flexShrink: 0,
              color: s.current ? emerald.glow : text.secondary,
              background: s.current ? emerald.deep : TOKENS.color.bg.bg2,
              border: `1px solid ${s.current ? emerald.felt : border.subtle}`,
            }}
          >
            {isMobileUA(s.userAgent) ? (
              <MobileOutlined />
            ) : s.current ? (
              <LaptopOutlined />
            ) : (
              <DesktopOutlined />
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 13.5, display: 'block' }}>
              {deviceLabel(s.userAgent) || t('profile.unknownDevice')}
            </Text>
            {s.current && (
              <StatusTag
                status="active"
                label={t('profile.currentDevice')}
                style={{ marginTop: 2 }}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      title: t('profile.colIp'),
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string | null) => <span className="tabular-nums">{ip || '—'}</span>,
    },
    {
      title: t('profile.colSignedIn'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => (
        <span className="tabular-nums">{dayjs(d).format('DD.MM.YYYY HH:mm')}</span>
      ),
    },
    {
      title: t('profile.colExpires'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (d: string) => (
        <span className="tabular-nums">{dayjs(d).format('DD.MM.YYYY HH:mm')}</span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      align: 'right',
      render: (_, s) =>
        s.current ? null : (
          <Popconfirm
            title={t('profile.revokeConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => void handleRevoke(s)}
          >
            <Button size="small" danger loading={revokingJti === s.jti}>
              {t('profile.revoke')}
            </Button>
          </Popconfirm>
        ),
    },
  ];

  const otherSessionsCount = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <PageTransition>
      <PageHeader
        icon={<UserOutlined />}
        title={t('profile.pageTitle')}
        subtitle={t('profile.pageSubtitle')}
      />

      <Row gutter={[16, 16]}>
        {/* Shaxsiy ma'lumotlar */}
        <Col xs={24} md={10}>
          <Card title={t('profile.infoTitle')} style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <span
                aria-hidden
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 21,
                  fontWeight: 700,
                  color: TOKENS.color.gold.contrast,
                  background: ROLE_COLORS[user.role],
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 16, display: 'block' }}>
                  {user.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  @{user.username}
                </Text>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {infoRows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {row.label}
                  </Text>
                  {row.value}
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Parolni almashtirish */}
        <Col xs={24} md={14}>
          <Card
            title={
              <span>
                <SafetyOutlined style={{ color: TOKENS.color.gold.base, marginRight: 8 }} />
                {t('profile.passwordTitle')}
              </span>
            }
            style={{ height: '100%' }}
          >
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
              {t('profile.passwordSubtitle')}
            </Text>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleChangePassword}
              requiredMark={false}
            >
              <Form.Item
                name="currentPassword"
                label={t('profile.currentPassword')}
                rules={[{ required: true, message: t('profile.currentRequired') }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  maxLength={100}
                  autoComplete="current-password"
                />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="newPassword"
                    label={t('profile.newPassword')}
                    rules={[{ required: true, min: 8, message: t('profile.newRequired') }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      maxLength={100}
                      autoComplete="new-password"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="confirmPassword"
                    label={t('profile.confirmPassword')}
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: t('profile.confirmRequired') },
                      ({ getFieldValue }) => ({
                        validator: (_, value) =>
                          !value || getFieldValue('newPassword') === value
                            ? Promise.resolve()
                            : Promise.reject(new Error(t('profile.confirmMismatch'))),
                      }),
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      maxLength={100}
                      autoComplete="new-password"
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={changing}>
                {t('profile.changeBtn')}
              </Button>
            </Form>
          </Card>
        </Col>

        {/* Faol qurilmalar */}
        <Col span={24}>
          <Card
            title={t('profile.sessionsTitle')}
            extra={
              otherSessionsCount > 0 && (
                <Popconfirm
                  title={t('profile.revokeOthersConfirm')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  onConfirm={handleRevokeOthers}
                >
                  <Button danger size="small" loading={revokingOthers}>
                    {t('profile.revokeOthers')}
                  </Button>
                </Popconfirm>
              )
            }
          >
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>
              {t('profile.sessionsSubtitle')}
            </Text>
            {sessionsError ? (
              <EmptyState
                icon={<WarningOutlined />}
                title={t('profile.sessionsLoadError')}
                action={
                  <Button icon={<ReloadOutlined />} onClick={() => void fetchSessions()}>
                    {t('profile.retry')}
                  </Button>
                }
              />
            ) : (
              <Table<AuthDeviceSession>
                rowKey="jti"
                columns={sessionColumns}
                dataSource={sessions ?? []}
                loading={sessions === null}
                pagination={false}
                scroll={{ x: 720 }}
                locale={{
                  emptyText: (
                    <EmptyState
                      title={t('profile.sessionsEmpty')}
                      style={{ padding: '24px 16px' }}
                    />
                  ),
                }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </PageTransition>
  );
};

export default Profile;
