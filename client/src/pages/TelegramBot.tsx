import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Dropdown,
  Modal,
  Popconfirm,
  QRCode,
  Segmented,
  Skeleton,
  Switch,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  BellOutlined,
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  LinkOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, ownerTelegramApi } from '../api';
import { PageHeader, PageTransition } from '../components/ui';
import {
  OWNER_ALERT_KEYS,
  type OwnerAlertKey,
  type OwnerReportKind,
  type OwnerTelegramChat,
  type OwnerTelegramChatPayload,
  type OwnerTelegramLink,
  type OwnerTelegramStatus,
} from '../types';
import { formatDateTime } from '../utils/format';
import { parseTelegramHtml, type TelegramHtmlNode as Node } from '../utils/telegramHtml';
import '../styles/telegram.css';

const { Text, Title, Paragraph } = Typography;

const REPORT_KINDS: OwnerReportKind[] = ['yesterday', 'today', 'week', 'live'];
const POLL_MS = 3000;

const renderNode = (node: Node | string, key: number): ReactNode => {
  if (typeof node === 'string') return <Fragment key={key}>{node}</Fragment>;
  const children = node.children.map(renderNode);
  switch (node.tag) {
    case 'b':
      return <strong key={key}>{children}</strong>;
    case 'i':
      return <em key={key}>{children}</em>;
    case 'code':
      return <code key={key}>{children}</code>;
    case 'a':
      return node.href && /^https?:\/\//i.test(node.href) ? (
        <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <Fragment key={key}>{children}</Fragment>
      );
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
};

export const TelegramPreview = ({ html }: { html: string }) => {
  const tree = useMemo(() => parseTelegramHtml(html), [html]);
  return <div className="tg-bubble">{tree.children.map(renderNode)}</div>;
};

/* ------------------------------------------------------------------ chat kartasi */

interface ChatCardProps {
  chat: OwnerTelegramChat;
  onChange: (chat: OwnerTelegramChat, patch: OwnerTelegramChatPayload) => void;
  onTest: (chat: OwnerTelegramChat) => void;
  onSend: (chat: OwnerTelegramChat, kind: OwnerReportKind) => void;
  onRemove: (chat: OwnerTelegramChat) => void;
  busy: boolean;
}

const ChatCard = ({ chat, onChange, onTest, onSend, onRemove, busy }: ChatCardProps) => {
  const { t } = useTranslation();
  const group = chat.chatType !== 'private';
  const status = chat.isActive
    ? { color: 'success', label: t('telegram.statusActive') }
    : chat.inactiveReason === 'blocked'
      ? { color: 'error', label: t('telegram.statusBlocked') }
      : { color: 'warning', label: t('telegram.statusStopped') };

  return (
    <Card className={`tg-chat${chat.isActive ? '' : ' is-inactive'}`} size="small">
      <div className="tg-chat__head">
        <span className="tg-chat__avatar" aria-hidden>
          {group ? <TeamOutlined /> : <UserOutlined />}
        </span>
        <div className="tg-chat__title">
          <Text strong ellipsis={{ tooltip: chat.title ?? undefined }}>{chat.title || t('telegram.untitled')}</Text>
          <Text type="secondary" className="tg-chat__meta">
            {group ? t('telegram.chatGroup') : t('telegram.chatPrivate')}
            {chat.linkedByName ? ` · ${t('telegram.linkedBy', { name: chat.linkedByName })}` : ''}
          </Text>
        </div>
        <Tag color={status.color}>{status.label}</Tag>
      </div>

      {!chat.isActive && <Alert className="tg-chat__alert" type="warning" showIcon message={t('telegram.inactiveHint')} />}

      <div className="tg-chat__grid">
        <section className="tg-chat__section">
          <div className="tg-row">
            <div className="tg-row__text">
              <Text strong>{t('telegram.dailyReport')}</Text>
              <Text type="secondary">{t('telegram.dailyReportHint')}</Text>
            </div>
            <Switch checked={chat.dailyReport} onChange={(value) => onChange(chat, { dailyReport: value })} />
          </div>
          <div className="tg-row">
            <div className="tg-row__text">
              <Text>{t('telegram.reportTime')}</Text>
            </div>
            <TimePicker
              value={dayjs(chat.reportTime, 'HH:mm')}
              format="HH:mm"
              minuteStep={5}
              allowClear={false}
              needConfirm={false}
              disabled={!chat.dailyReport}
              onChange={(value) => value && onChange(chat, { reportTime: value.format('HH:mm') })}
            />
          </div>
          <div className="tg-row">
            <div className="tg-row__text">
              <Text>{t('telegram.periodReports')}</Text>
              <Text type="secondary">{t('telegram.periodReportsHint')}</Text>
            </div>
            <Switch
              checked={chat.periodReports}
              disabled={!chat.dailyReport}
              onChange={(value) => onChange(chat, { periodReports: value })}
            />
          </div>
          <div className="tg-row">
            <div className="tg-row__text">
              <Text>{t('telegram.language')}</Text>
            </div>
            <Segmented
              size="small"
              value={chat.lang}
              options={[
                { value: 'uz', label: "O'zbekcha" },
                { value: 'ru', label: 'Русский' },
              ]}
              onChange={(value) => onChange(chat, { lang: value as 'uz' | 'ru' })}
            />
          </div>
        </section>

        <section className="tg-chat__section">
          <Text strong className="tg-chat__section-title">
            <BellOutlined /> {t('telegram.alertsTitle')}
          </Text>
          {OWNER_ALERT_KEYS.map((key: OwnerAlertKey) => (
            <div className="tg-row" key={key}>
              <div className="tg-row__text">
                <Text>{t(`telegram.alert_${key}`)}</Text>
                <Text type="secondary">{t(`telegram.alert_${key}Hint`)}</Text>
              </div>
              <Switch
                size="small"
                checked={chat.alerts[key]}
                onChange={(value) => onChange(chat, { alerts: { [key]: value } })}
              />
            </div>
          ))}
          {!group && <Text type="secondary" className="tg-chat__hint">{t('telegram.ownActionsHint')}</Text>}
        </section>
      </div>

      <div className="tg-chat__footer">
        <div className="tg-chat__status">
          {chat.lastSentAt && <Text type="secondary">{t('telegram.lastSent', { time: formatDateTime(chat.lastSentAt) })}</Text>}
          {chat.lastError && chat.isActive && (
            <Text type="danger">{t('telegram.lastError', { error: chat.lastError })}</Text>
          )}
        </div>
        <div className="tg-chat__actions">
          <Button icon={<MessageOutlined />} disabled={!chat.isActive || busy} onClick={() => onTest(chat)}>
            {t('telegram.test')}
          </Button>
          <Dropdown
            disabled={!chat.isActive || busy}
            trigger={['click']}
            menu={{
              items: REPORT_KINDS.map((kind) => ({ key: kind, label: t(`telegram.send_${kind}`) })),
              onClick: ({ key }) => onSend(chat, key as OwnerReportKind),
            }}
          >
            <Button type="primary" icon={<SendOutlined />} loading={busy}>
              {t('telegram.sendNow')}
            </Button>
          </Dropdown>
          <Popconfirm title={t('telegram.removeConfirm')} okText={t('common.yes')} cancelText={t('common.no')} onConfirm={() => onRemove(chat)}>
            <Button danger icon={<DeleteOutlined />} aria-label={t('telegram.remove')} />
          </Popconfirm>
        </div>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ ulash oynasi */

interface ConnectModalProps {
  open: boolean;
  link: OwnerTelegramLink | null;
  loading: boolean;
  connected: OwnerTelegramChat | null;
  onRenew: () => void;
  onClose: () => void;
}

const ConnectModal = ({ open, link, loading, connected, onRenew, onClose }: ConnectModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const leftMs = link ? new Date(link.expiresAt).getTime() - now : 0;
  const expired = !!link && leftMs <= 0;
  const minutes = link ? Math.max(1, Math.round((new Date(link.expiresAt).getTime() - Date.now()) / 60000)) : 15;
  const countdown = `${Math.max(0, Math.floor(leftMs / 60000))}:${String(Math.max(0, Math.floor((leftMs % 60000) / 1000))).padStart(2, '0')}`;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      message.success(t('telegram.copied'));
    } catch {
      /* clipboard yopiq — QR va tugma bor */
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={560} title={t('telegram.connectTitle')} destroyOnHidden>
      {connected ? (
        <div className="tg-connected">
          <CheckCircleFilled className="tg-connected__icon" />
          <Title level={4}>{t('telegram.connected', { title: connected.title || t('telegram.untitled') })}</Title>
          <Paragraph type="secondary">{t('telegram.connectedHint')}</Paragraph>
          <Button type="primary" onClick={onClose}>
            OK
          </Button>
        </div>
      ) : loading || !link ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div className="tg-connect">
          <div className="tg-connect__qr">
            <QRCode value={link.url} size={196} status={expired ? 'expired' : 'active'} onRefresh={onRenew} bordered={false} />
            {!expired && <Text type="secondary" className="tg-connect__timer">{countdown}</Text>}
          </div>
          <div className="tg-connect__steps">
            <ol>
              <li>{t('telegram.connectStep1')}</li>
              <li>{t('telegram.connectStep2')}</li>
              <li>{t('telegram.connectStep3')}</li>
            </ol>
            {expired ? (
              <Alert
                type="warning"
                showIcon
                message={t('telegram.linkExpired')}
                action={<Button size="small" onClick={onRenew}>{t('telegram.newLink')}</Button>}
              />
            ) : (
              <>
                <div className="tg-connect__buttons">
                  <Button type="primary" icon={<SendOutlined />} href={link.url} target="_blank" rel="noopener noreferrer">
                    {t('telegram.openTelegram')}
                  </Button>
                  <Button icon={<CopyOutlined />} onClick={() => void copy()}>
                    {t('telegram.copyLink')}
                  </Button>
                </div>
                <Button type="link" icon={<TeamOutlined />} href={link.groupUrl} target="_blank" rel="noopener noreferrer" className="tg-connect__group">
                  {t('telegram.addToGroup')}
                </Button>
                <Text type="secondary" className="tg-connect__hint">{t('telegram.groupHint')}</Text>
                <Text type="secondary" className="tg-connect__waiting">
                  <span className="tg-pulse" aria-hidden /> {t('telegram.waiting')}
                </Text>
              </>
            )}
            <Text type="secondary" className="tg-connect__hint">{t('telegram.linkExpires', { min: minutes })}</Text>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------------ sahifa */

const TelegramBot = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const uiLang: 'uz' | 'ru' = i18n.language.startsWith('ru') ? 'ru' : 'uz';
  const [status, setStatus] = useState<OwnerTelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyChat, setBusyChat] = useState<number | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);
  const [link, setLink] = useState<OwnerTelegramLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [connected, setConnected] = useState<OwnerTelegramChat | null>(null);
  /** Oyna ochilgan paytdagi chatlar (id -> faolmi) — yangisi yoki qayta yoqilgani "ulandi" */
  const snapshot = useRef(new Map<number, boolean>());

  const [previewKind, setPreviewKind] = useState<OwnerReportKind>('yesterday');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await ownerTelegramApi.status();
      setStatus(res.data);
      setLoadError(null);
      return res.data;
    } catch (err) {
      if (!quiet) setLoadError(errorMessage(err, tRef.current('common.error')));
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPreview = useCallback(async (kind: OwnerReportKind, lang: 'uz' | 'ru') => {
    setPreviewLoading(true);
    try {
      const res = await ownerTelegramApi.preview(kind, lang);
      setPreviewText(res.data.text);
    } catch (err) {
      setPreviewText(null);
      message.error(errorMessage(err, tRef.current('common.error')));
    } finally {
      setPreviewLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadPreview(previewKind, uiLang);
  }, [previewKind, uiLang, loadPreview]);

  /* ------------------------------------------------------------ ulash */

  const requestLink = useCallback(async () => {
    setLinkLoading(true);
    try {
      const res = await ownerTelegramApi.link();
      setLink(res.data);
    } catch (err) {
      message.error(errorMessage(err, tRef.current('common.error')));
      setConnectOpen(false);
    } finally {
      setLinkLoading(false);
    }
  }, [message]);

  const openConnect = () => {
    snapshot.current = new Map((status?.chats ?? []).map((chat) => [chat.id, chat.isActive]));
    setConnected(null);
    setLink(null);
    setConnectOpen(true);
    void requestLink();
  };

  // Oyna ochiq turganda — yangi chat ulanganini kuzatamiz
  useEffect(() => {
    if (!connectOpen || connected) return undefined;
    const timer = window.setInterval(async () => {
      const fresh = await load(true);
      const found = fresh?.chats.find((chat) => {
        const before = snapshot.current.get(chat.id);
        return chat.isActive && (before === undefined || before === false);
      });
      if (found) setConnected(found);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [connectOpen, connected, load]);

  /* ------------------------------------------------------- chat amallari */

  const updateChat = async (chat: OwnerTelegramChat, patch: OwnerTelegramChatPayload) => {
    const optimistic: OwnerTelegramChat = {
      ...chat,
      ...(patch.dailyReport !== undefined ? { dailyReport: patch.dailyReport } : {}),
      ...(patch.periodReports !== undefined ? { periodReports: patch.periodReports } : {}),
      ...(patch.reportTime !== undefined ? { reportTime: patch.reportTime } : {}),
      ...(patch.lang !== undefined ? { lang: patch.lang } : {}),
      alerts: { ...chat.alerts, ...(patch.alerts ?? {}) } as OwnerTelegramChat['alerts'],
    };
    const replace = (next: OwnerTelegramChat) =>
      setStatus((prev) => (prev ? { ...prev, chats: prev.chats.map((c) => (c.id === next.id ? next : c)) } : prev));
    replace(optimistic);
    try {
      const res = await ownerTelegramApi.update(chat.id, patch);
      replace(res.data);
    } catch (err) {
      replace(chat);
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const testChat = async (chat: OwnerTelegramChat) => {
    setBusyChat(chat.id);
    try {
      const res = await ownerTelegramApi.test(chat.id);
      if (res.success) message.success(t('telegram.sentOk'));
      else message.error(res.message ?? t('common.error'));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusyChat(null);
      void load(true);
    }
  };

  const sendReport = async (chat: OwnerTelegramChat, kind: OwnerReportKind) => {
    setBusyChat(chat.id);
    try {
      const res = await ownerTelegramApi.sendReport(chat.id, kind);
      if (res.success) message.success(t('telegram.sentOk'));
      else message.error(res.message ?? t('common.error'));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusyChat(null);
      void load(true);
    }
  };

  const removeChat = async (chat: OwnerTelegramChat) => {
    try {
      const res = await ownerTelegramApi.remove(chat.id);
      message.success(res.message ?? t('telegram.remove'));
      setStatus((prev) => (prev ? { ...prev, chats: prev.chats.filter((c) => c.id !== chat.id) } : prev));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  /* ------------------------------------------------------------- render */

  const chats = status?.chats ?? [];
  const canConnect = !!status?.available && chats.length < (status?.maxChats ?? 10);

  const features = [
    { icon: <BarChartOutlined />, title: t('telegram.featureDailyTitle'), text: t('telegram.featureDaily') },
    { icon: <ThunderboltOutlined />, title: t('telegram.featureAlertsTitle'), text: t('telegram.featureAlerts') },
    { icon: <MessageOutlined />, title: t('telegram.featureCommandsTitle'), text: t('telegram.featureCommands') },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<SendOutlined />}
        title={t('telegram.title')}
        subtitle={t('telegram.subtitle')}
        extra={
          chats.length > 0 && canConnect ? (
            <Button type="primary" icon={<LinkOutlined />} onClick={openConnect}>
              {t('telegram.connectAnother')}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} action={<Button onClick={() => void load()}>{t('tables.retry')}</Button>} />
      ) : (
        <div className="tg-page">
          <div className="tg-main">
            {!status?.available && <Alert type="info" showIcon message={t('telegram.notConfigured')} />}

            {chats.length === 0 && (
              <Card className="tg-hero">
                <div className="tg-hero__head">
                  <span className="tg-hero__icon" aria-hidden>
                    <SendOutlined />
                  </span>
                  <div>
                    <Title level={3}>{t('telegram.heroTitle')}</Title>
                    <Paragraph type="secondary">{t('telegram.heroText')}</Paragraph>
                  </div>
                </div>
                <div className="tg-hero__features">
                  {features.map((item) => (
                    <div className="tg-feature" key={item.title}>
                      <span className="tg-feature__icon">{item.icon}</span>
                      <Text strong>{item.title}</Text>
                      <Text type="secondary">{item.text}</Text>
                    </div>
                  ))}
                </div>
                <Button type="primary" size="large" icon={<LinkOutlined />} disabled={!canConnect} onClick={openConnect}>
                  {t('telegram.connect')}
                </Button>
              </Card>
            )}

            {chats.length > 0 && (
              <section className="tg-chats">
                <div className="tg-section-head">
                  <Title level={5}>{t('telegram.chatsTitle')}</Title>
                  <Text type="secondary">{t('telegram.chatsCount', { n: chats.length, max: status?.maxChats ?? 10 })}</Text>
                </div>
                {chats.map((chat) => (
                  <ChatCard
                    key={chat.id}
                    chat={chat}
                    busy={busyChat === chat.id}
                    onChange={(c, patch) => void updateChat(c, patch)}
                    onTest={(c) => void testChat(c)}
                    onSend={(c, kind) => void sendReport(c, kind)}
                    onRemove={(c) => void removeChat(c)}
                  />
                ))}
              </section>
            )}
          </div>

          <aside className="tg-side">
            <Card size="small" title={t('telegram.previewTitle')}>
              <Segmented
                block
                size="small"
                value={previewKind}
                onChange={(value) => setPreviewKind(value as OwnerReportKind)}
                options={REPORT_KINDS.map((kind) => ({ value: kind, label: t(`telegram.tab_${kind}`) }))}
                className="tg-preview-switch"
              />
              <div className="tg-phone">
                {previewLoading && !previewText ? <Skeleton active paragraph={{ rows: 7 }} /> : previewText && <TelegramPreview html={previewText} />}
              </div>
              <Text type="secondary" className="tg-preview-hint">{t('telegram.previewHint')}</Text>
            </Card>

            <Card size="small" title={t('telegram.commandsTitle')}>
              <dl className="tg-commands">
                {(['hisobot', 'bugun', 'hozir', 'hafta', 'stop'] as const).map((cmd) => (
                  <div key={cmd}>
                    <dt>/{cmd}</dt>
                    <dd>{t(`telegram.cmd_${cmd}`)}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card size="small" title={<span><SafetyCertificateOutlined /> {t('telegram.securityTitle')}</span>}>
              <Text type="secondary">{t('telegram.securityText')}</Text>
            </Card>
          </aside>
        </div>
      )}

      <ConnectModal
        open={connectOpen}
        link={link}
        loading={linkLoading}
        connected={connected}
        onRenew={() => void requestLink()}
        onClose={() => {
          setConnectOpen(false);
          void load(true);
        }}
      />
    </PageTransition>
  );
};

export default TelegramBot;
