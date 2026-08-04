import { App, Button, Drawer, List, Popconfirm, Space, Tag, Typography } from 'antd';
import {
  ClockCircleOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { TOKENS } from '../../theme/tokens';
import EmptyState from './EmptyState';

const { Text, Paragraph } = Typography;

/**
 * YUBORILMAGAN AMALLAR OYNASI.
 *
 * Kassir uchun eng muhim savolga javob beradi: "men internetsiz kiritgan
 * narsalar qayerda?". Har bir amal ro'yxatda ko'rinadi, hech biri jimgina
 * yo'qolmaydi. Serverga o'tmagan amalni faqat foydalanuvchining O'ZI
 * "voz kechish" bilan olib tashlay oladi.
 */
const OfflineQueueDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { entries, online, pending, sync, retry, discard } = useConnection();

  const handleDiscard = async (seq: number) => {
    const removed = await discard(seq);
    // Bog'liq amallar ham olib tashlanadi (masalan shu sessiyaning pauzasi va
    // bar buyurtmasi) — foydalanuvchi nechtasi ketganini bilishi kerak
    message.success(
      removed > 1 ? t('offline.discardedWithLinked', { count: removed }) : t('offline.discarded'),
    );
  };

  return (
    <Drawer
      title={t('offline.queueTitle')}
      open={open}
      onClose={onClose}
      width={460}
      extra={
        pending > 0 && online ? (
          <Button icon={<CloudSyncOutlined />} onClick={() => void sync()}>
            {t('offline.syncNow')}
          </Button>
        ) : null
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={<CloudSyncOutlined />}
          title={t('offline.queueEmpty')}
          hint={t('offline.queueEmptyHint')}
        />
      ) : (
        <List
          dataSource={entries}
          rowKey={(item) => String(item.seq ?? item.localId)}
          renderItem={(item) => {
            const isFailed = item.status === 'failed';
            return (
              <List.Item
                actions={[
                  ...(isFailed
                    ? [
                        <Button
                          key="retry"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => item.seq !== undefined && void retry(item.seq)}
                        >
                          {t('offline.retry')}
                        </Button>,
                      ]
                    : []),
                  <Popconfirm
                    key="discard"
                    title={t('offline.discardConfirm')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => item.seq !== undefined && void handleDiscard(item.seq)}
                  >
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <span
                      style={{
                        color: isFailed
                          ? TOKENS.color.semantic.error
                          : TOKENS.color.semantic.info,
                        fontSize: 18,
                      }}
                    >
                      {isFailed ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />}
                    </span>
                  }
                  title={
                    <Space size={8} wrap>
                      <Text strong>{t(item.labelKey, item.labelParams)}</Text>
                      <Tag color={isFailed ? 'error' : 'processing'}>
                        {isFailed ? t('offline.queueFailed') : t('offline.queuePending')}
                      </Tag>
                    </Space>
                  }
                  description={
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleString()}
                        {item.attempts > 0 && ` · ${t('offline.attempts', { count: item.attempts })}`}
                      </Text>
                      {item.lastError && (
                        <Paragraph
                          style={{
                            margin: '4px 0 0',
                            fontSize: 12,
                            color: TOKENS.color.semantic.error,
                          }}
                        >
                          {item.lastError}
                        </Paragraph>
                      )}
                    </>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Drawer>
  );
};

export default OfflineQueueDrawer;
