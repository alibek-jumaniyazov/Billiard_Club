import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Image,
  Input,
  List,
  Row,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd';
import {
  CommentOutlined,
  DeleteOutlined,
  InboxOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, feedbackApi } from '../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../components/ui';
import AttachmentThumbs from '../components/ui/AttachmentThumbs';
import { FEEDBACK_PRIORITIES, FEEDBACK_TYPES } from '../constants';
import { TOKENS } from '../theme/tokens';
import type { Feedback as FeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackType } from '../types';

const { Text, Paragraph } = Typography;

/** Server cheklovlari bilan bir xil: 3 ta rasm, har biri 500KB gacha */
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 500 * 1024;
const MAX_DIMENSION = 1600;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Holat/tur/muhimlik -> StatusTag palitra kaliti */
const STATUS_TAG_KEY: Record<FeedbackStatus, string> = {
  unread: 'warning',
  read: 'info',
  resolved: 'success',
  rejected: 'cancelled',
};
const TYPE_TAG_KEY: Record<FeedbackType, string> = {
  suggestion: 'info',
  complaint: 'warning',
  bug: 'error',
  feature: 'success',
};
const PRIORITY_TAG_KEY: Record<FeedbackPriority, string> = {
  low: 'default',
  medium: 'warning',
  high: 'error',
};

/** data-URL dagi taxminiy bayt hajmi (base64 kengayishini hisobga olib) */
const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
};

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });

/**
 * Rasmni canvas orqali JPEG ga siqadi: avval o'lcham, keyin sifat pasayadi.
 * 500KB dan kichraytirib bo'lmasa null qaytaradi.
 */
const compressImage = async (file: File): Promise<string | null> => {
  // Kichik fayl — siqmasdan asl holida yuboriladi (turi ruxsat etilgan)
  if (file.size <= MAX_ATTACHMENT_BYTES) {
    const original = await readAsDataUrl(file);
    if (dataUrlBytes(original) <= MAX_ATTACHMENT_BYTES) return original;
  }

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  for (const scale of [1, 0.75, 0.5, 0.35]) {
    const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
    const factor = Math.min(1, MAX_DIMENSION / maxSide) * scale;
    canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlBytes(dataUrl) <= MAX_ATTACHMENT_BYTES) return dataUrl;
    }
  }
  return null;
};

interface FeedbackFormValues {
  type: FeedbackType;
  priority: FeedbackPriority;
  category?: string;
  subject: string;
  message: string;
}

const Feedback = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [form] = Form.useForm<FeedbackFormValues>();
  const [attachments, setAttachments] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const fetchList = useCallback(
    async (nextPage: number) => {
      setListLoading(true);
      setListError(false);
      try {
        const res = await feedbackApi.list({ page: nextPage, limit: pageSize });
        setItems(res.data);
        setTotal(res.pagination?.total ?? 0);
      } catch (err) {
        setListError(true);
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setListLoading(false);
      }
    },
    [message, t],
  );

  useEffect(() => {
    void fetchList(1);
  }, [fetchList]);

  // ---------- Rasm biriktirish ----------
  const handleFile = (file: File): typeof Upload.LIST_IGNORE => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      message.error(t('feedback.attachmentInvalidType'));
      return Upload.LIST_IGNORE;
    }
    setCompressing(true);
    compressImage(file)
      .then((dataUrl) => {
        if (!dataUrl) {
          message.error(t('feedback.attachmentTooLarge'));
          return;
        }
        setAttachments((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, dataUrl],
        );
      })
      .catch(() => message.error(t('feedback.attachmentReadError')))
      .finally(() => setCompressing(false));
    return Upload.LIST_IGNORE;
  };

  const removeAttachment = (index: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index));

  // ---------- Yuborish ----------
  const handleSubmit = async (values: FeedbackFormValues) => {
    setSubmitting(true);
    try {
      const res = await feedbackApi.submit({
        type: values.type,
        priority: values.priority,
        category: values.category || undefined,
        subject: values.subject,
        message: values.message,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      message.success(res.message);
      form.resetFields();
      setAttachments([]);
      setPage(1);
      void fetchList(1);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<CommentOutlined />}
        title={t('feedback.title')}
        subtitle={t('feedback.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchList(page)}
            aria-label={t('btn.refresh')}
          />
        }
      />

      <Row gutter={[16, 16]}>
        {/* Yuborish formasi */}
        <Col xs={24} lg={10} xl={9}>
          <Card title={t('feedback.formTitle')}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ type: 'suggestion', priority: 'medium' }}
              onFinish={(values) => void handleSubmit(values)}
            >
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="type" label={t('feedback.typeLabel')} rules={[{ required: true }]}>
                    <Select
                      options={FEEDBACK_TYPES.map((value) => ({
                        value,
                        label: t(`feedback.type.${value}`),
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="priority"
                    label={t('feedback.priorityLabel')}
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={FEEDBACK_PRIORITIES.map((value) => ({
                        value,
                        label: t(`feedback.priority.${value}`),
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="category" label={t('feedback.categoryLabel')}>
                <Input maxLength={50} placeholder={t('feedback.categoryPlaceholder')} />
              </Form.Item>
              <Form.Item
                name="subject"
                label={t('feedback.subjectLabel')}
                rules={[{ required: true, whitespace: true, message: t('feedback.subjectRequired') }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                name="message"
                label={t('feedback.messageLabel')}
                rules={[{ required: true, whitespace: true, message: t('feedback.messageRequired') }]}
              >
                <Input.TextArea rows={5} maxLength={5000} showCount />
              </Form.Item>

              <Form.Item label={t('feedback.attachmentsLabel')} extra={t('feedback.attachmentsHint')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: TOKENS.spacing.xs }}>
                  <Image.PreviewGroup>
                    {attachments.map((dataUrl, index) => (
                      <div key={index} style={{ position: 'relative' }}>
                        <Image
                          src={dataUrl}
                          alt={`${t('feedback.attachmentsLabel')} ${index + 1}`}
                          width={88}
                          height={88}
                          style={{
                            objectFit: 'cover',
                            borderRadius: TOKENS.radius.sm,
                            border: `1px solid ${TOKENS.color.border.base}`,
                          }}
                        />
                        <Button
                          danger
                          size="small"
                          type="primary"
                          icon={<DeleteOutlined />}
                          aria-label={t('btn.delete')}
                          onClick={() => removeAttachment(index)}
                          style={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            minWidth: 24,
                            width: 24,
                            height: 24,
                            padding: 0,
                            borderRadius: '50%',
                          }}
                        />
                      </div>
                    ))}
                  </Image.PreviewGroup>
                  {attachments.length < MAX_ATTACHMENTS && (
                    <Upload
                      accept={ACCEPTED_TYPES.join(',')}
                      showUploadList={false}
                      beforeUpload={handleFile}
                    >
                      <Button
                        type="dashed"
                        loading={compressing}
                        icon={<PlusOutlined />}
                        style={{ width: 88, height: 88 }}
                      >
                        {!compressing && (
                          <span style={{ fontSize: 12, display: 'block' }}>
                            {t('feedback.addImage')}
                          </span>
                        )}
                      </Button>
                    </Upload>
                  )}
                </div>
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={submitting}
                block
              >
                {t('feedback.submit')}
              </Button>
            </Form>
          </Card>
        </Col>

        {/* Mening murojaatlarim */}
        <Col xs={24} lg={14} xl={15}>
          <Card title={t('feedback.submissionsTitle')}>
            {listError && !listLoading && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: TOKENS.spacing.md }}
                message={t('common.error')}
                action={
                  <Button size="small" onClick={() => void fetchList(page)}>
                    {t('btn.refresh')}
                  </Button>
                }
              />
            )}
            <List
              loading={listLoading}
              dataSource={items}
              locale={{
                emptyText: (
                  <EmptyState
                    icon={<InboxOutlined />}
                    title={t('feedback.noSubmissions')}
                    hint={t('feedback.noSubmissionsHint')}
                  />
                ),
              }}
              pagination={
                total > pageSize
                  ? {
                      current: page,
                      pageSize,
                      total,
                      onChange: (p) => {
                        setPage(p);
                        void fetchList(p);
                      },
                    }
                  : false
              }
              renderItem={(item) => (
                <List.Item key={item.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: TOKENS.spacing.xs,
                        alignItems: 'center',
                      }}
                    >
                      <Text strong style={{ flex: '1 1 auto', minWidth: 0 }}>
                        {item.subject}
                      </Text>
                      <StatusTag
                        status={STATUS_TAG_KEY[item.status]}
                        label={t(`feedback.status.${item.status}`)}
                      />
                    </div>
                    <Space wrap size={4} style={{ marginTop: 6 }}>
                      <StatusTag
                        status={TYPE_TAG_KEY[item.type]}
                        label={t(`feedback.type.${item.type}`)}
                      />
                      <StatusTag
                        status={PRIORITY_TAG_KEY[item.priority]}
                        label={t(`feedback.priority.${item.priority}`)}
                      />
                      {item.category && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.category}
                        </Text>
                      )}
                    </Space>
                    <Paragraph
                      type="secondary"
                      style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}
                      ellipsis={{ rows: 2, expandable: true, symbol: '…' }}
                    >
                      {item.message}
                    </Paragraph>

                    {item.attachments && item.attachments.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          gap: TOKENS.spacing.xs,
                          marginTop: 8,
                          alignItems: 'center',
                        }}
                      >
                        <PaperClipOutlined style={{ color: TOKENS.color.text.tertiary }} />
                        <AttachmentThumbs
                          ownerId={item.id}
                          count={item.attachments.length}
                          fetcher={(index) => feedbackApi.attachment(item.id, index)}
                          alt={item.subject}
                        />
                      </div>
                    )}

                    {item.reply && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          borderRadius: TOKENS.radius.sm,
                          background: TOKENS.color.emerald.deepest,
                          border: `1px solid ${TOKENS.color.emerald.felt}`,
                        }}
                      >
                        <Text
                          strong
                          style={{ fontSize: 12.5, color: TOKENS.color.emerald.glow, display: 'block' }}
                        >
                          {t('feedback.replyTitle')}
                          {item.repliedAt && (
                            <span
                              className="tabular-nums"
                              style={{
                                fontWeight: 400,
                                color: TOKENS.color.text.tertiary,
                                marginInlineStart: 8,
                              }}
                            >
                              {dayjs(item.repliedAt).format('DD.MM.YYYY HH:mm')}
                            </span>
                          )}
                        </Text>
                        <Paragraph style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                          {item.reply}
                        </Paragraph>
                      </div>
                    )}

                    <Text
                      type="secondary"
                      className="tabular-nums"
                      style={{ fontSize: 12, display: 'block', marginTop: 8 }}
                    >
                      {dayjs(item.createdAt).format('DD.MM.YYYY HH:mm')}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </PageTransition>
  );
};

export default Feedback;
