import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  InboxOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, releasesApi } from '../../api';
import { EmptyState, PageHeader, PageTransition } from '../../components/ui';
import type { AppRelease, ReleasePlatform } from '../../types';

const { Text } = Typography;

const PLATFORMS: ReleasePlatform[] = ['win', 'mac', 'linux'];

/** Platforma -> ruxsat etilgan kengaytmalar (server bilan bir xil oq ro'yxat) */
const ACCEPT: Record<ReleasePlatform, string> = {
  win: '.exe,.msi',
  mac: '.dmg,.zip',
  linux: '.AppImage,.deb,.rpm',
};

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

interface UploadFormValues {
  version: string;
  platform: ReleasePlatform;
  notesUz?: string;
  notesRu?: string;
}

/**
 * SUPERADMIN — DESKTOP RELIZLARI.
 *
 * Yuklash ikki bosqichli va bu ATAYLAB:
 *   1. Fayl yuklanadi — lekin hali HECH KIMGA ko'rinmaydi;
 *   2. "Nashr etish" bosilgach /download da va auto-update feed'ida paydo bo'ladi.
 *
 * Sabab: yangi versiyani avval o'zingiz o'rnatib sinab ko'rishingiz kerak.
 * Bir bosqichli yuklashda buzuq build butun mijozlar bazasiga darhol
 * tarqalib ketardi va uni ORQAGA QAYTARIB bo'lmasdi (o'rnatilgan dasturlar
 * allaqachon yangilangan bo'lardi).
 */
const AdminReleases = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [rows, setRows] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [form] = Form.useForm<UploadFormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);

  const platform = Form.useWatch('platform', form) ?? 'win';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await releasesApi.list();
      setRows(res.data ?? []);
    } catch (err) {
      setError(errorMessage(err, t('adminReleases.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (values: UploadFormValues) => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error(t('adminReleases.fileRequired'));
      return;
    }
    setUploading(true);
    setPercent(0);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('version', values.version.trim());
      body.append('platform', values.platform);
      if (values.notesUz?.trim()) body.append('notesUz', values.notesUz.trim());
      if (values.notesRu?.trim()) body.append('notesRu', values.notesRu.trim());

      const res = await releasesApi.upload(body, setPercent);
      message.success(res.message ?? t('adminReleases.uploaded'));
      setUploadOpen(false);
      setFileList([]);
      form.resetFields();
      await load();
    } catch (err) {
      message.error(errorMessage(err, t('adminReleases.uploadError')));
    } finally {
      setUploading(false);
      setPercent(0);
    }
  };

  const setPublished = async (row: AppRelease, publish: boolean) => {
    setBusyId(row.id);
    try {
      const res = publish
        ? await releasesApi.publish(row.id)
        : await releasesApi.unpublish(row.id);
      message.success(res.message ?? t('common.saved'));
      await load();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: AppRelease) => {
    setBusyId(row.id);
    try {
      await releasesApi.remove(row.id);
      message.success(t('adminReleases.deleted'));
      await load();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const columns: ColumnsType<AppRelease> = [
    {
      title: t('adminReleases.colVersion'),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.version}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.fileName}
          </Text>
        </Space>
      ),
    },
    {
      title: t('adminReleases.colPlatform'),
      render: (_, r) => <Tag>{t(`adminReleases.pf_${r.platform}`)}</Tag>,
    },
    { title: t('adminReleases.colSize'), render: (_, r) => formatSize(r.size) },
    {
      title: t('adminReleases.colStatus'),
      render: (_, r) =>
        r.isPublished ? (
          <Tag color="green">{t('adminReleases.published')}</Tag>
        ) : (
          <Tag color="orange">{t('adminReleases.draft')}</Tag>
        ),
    },
    {
      title: t('adminReleases.colDownloads'),
      align: 'right',
      render: (_, r) => r.downloads,
    },
    {
      title: t('adminReleases.colDate'),
      render: (_, r) => dayjs(r.publishedAt ?? r.createdAt).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('common.actions'),
      render: (_, r) => (
        <Space wrap size={4}>
          {r.isPublished ? (
            <Button
              size="small"
              icon={<EyeInvisibleOutlined />}
              loading={busyId === r.id}
              onClick={() => void setPublished(r, false)}
            >
              {t('adminReleases.unpublish')}
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<RocketOutlined />}
              loading={busyId === r.id}
              onClick={() => void setPublished(r, true)}
            >
              {t('adminReleases.publish')}
            </Button>
          )}
          <Button size="small" icon={<CloudDownloadOutlined />} href={r.url} />
          <Popconfirm
            title={t('adminReleases.deleteConfirm')}
            description={t('adminReleases.deleteHint')}
            okButtonProps={{ danger: true }}
            onConfirm={() => void remove(r)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === r.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        title={t('adminReleases.title')}
        subtitle={t('adminReleases.subtitle')}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              {t('btn.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              {t('adminReleases.upload')}
            </Button>
          </Space>
        }
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('adminReleases.howToTitle')}
        description={
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 13 }}>{t('adminReleases.howTo1')}</Text>
            <Text style={{ fontSize: 13 }}>{t('adminReleases.howTo2')}</Text>
            <Text style={{ fontSize: 13 }}>{t('adminReleases.howTo3')}</Text>
          </Space>
        }
      />

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<InboxOutlined />}
          title={t('adminReleases.empty')}
          hint={t('adminReleases.emptyHint')}
          action={
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              {t('adminReleases.upload')}
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      )}

      <Modal
        open={uploadOpen}
        title={t('adminReleases.upload')}
        okText={t('adminReleases.upload')}
        confirmLoading={uploading}
        onCancel={() => !uploading && setUploadOpen(false)}
        onOk={() => form.submit()}
        // Yuklash davom etayotganda oynani yopib bo'lmaydi: yopilsa so'rov
        // uzilib, yarim yuklangan fayl serverda qolib ketardi
        maskClosable={!uploading}
        closable={!uploading}
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ platform: 'win' as ReleasePlatform }}
          onFinish={(v) => void submit(v)}
        >
          <Form.Item
            name="platform"
            label={t('adminReleases.colPlatform')}
            rules={[{ required: true }]}
          >
            <Select
              options={PLATFORMS.map((p) => ({ value: p, label: t(`adminReleases.pf_${p}`) }))}
            />
          </Form.Item>

          <Form.Item
            name="version"
            label={t('adminReleases.colVersion')}
            extra={t('adminReleases.versionHint')}
            rules={[
              { required: true },
              {
                pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
                message: t('adminReleases.versionInvalid'),
              },
            ]}
          >
            <Input placeholder="1.0.1" />
          </Form.Item>

          <Form.Item label={t('adminReleases.file')} required>
            <Upload.Dragger
              // Avtomatik yuklash O'CHIQ: fayl formadagi boshqa maydonlar
              // bilan BIRGA, bitta so'rovda ketishi kerak
              beforeUpload={() => false}
              maxCount={1}
              accept={ACCEPT[platform as ReleasePlatform]}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t('adminReleases.dropHere')}</p>
              <p className="ant-upload-hint">{ACCEPT[platform as ReleasePlatform]}</p>
            </Upload.Dragger>
          </Form.Item>

          <Form.Item name="notesUz" label={t('adminReleases.notesUz')}>
            <Input.TextArea rows={2} maxLength={4000} showCount />
          </Form.Item>
          <Form.Item name="notesRu" label={t('adminReleases.notesRu')}>
            <Input.TextArea rows={2} maxLength={4000} showCount />
          </Form.Item>

          {uploading && (
            <Progress percent={percent} status={percent >= 100 ? 'success' : 'active'} />
          )}
        </Form>
      </Modal>
    </PageTransition>
  );
};

export default AdminReleases;
