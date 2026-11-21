import { useState } from 'react';
import { Alert, App, Button, Collapse, Popconfirm, Radio, Space, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CopyOutlined,
  DesktopOutlined,
  DownloadOutlined,
  KeyOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { lightsApi } from '../../../api';
import { desktopLights, type LightHubStatus } from '../../../offline/desktop';
import type { LightMode, LightsOverview } from '../../../types';
import { formatDateTime } from '../../../utils/format';
import { lightErrorText } from './hub-errors';
import { lightCopy } from './light-copy';

const { Text, Paragraph } = Typography;

export interface LightControllerCardProps {
  data: LightsOverview;
  hubStatus: LightHubStatus | null;
  canEdit: boolean;
  /** Oynadagi boshqa amal bajarilmoqda */
  busy: boolean;
  onSaveMode: (mode: LightMode) => void;
  /** Ko'rinishni qayta yuklash (markaz yoqilgan/o'chirilgan, token berilgan) */
  onChanged: () => void;
}

/**
 * BOSHQARUVCHI: relelarga buyruqni kim beradi.
 *  - kompyuter dasturida — "Shu kompyuter — chiroq markazi" (internetsiz ishlaydi);
 *  - brauzerda — dasturni o'rnatish tavsiyasi;
 *  - ikkalasida ham — alohida agent (Raspberry Pi) uchun token.
 */
const LightControllerCard = ({ data, hubStatus, canEdit, busy, onSaveMode, onChanged }: LightControllerCardProps) => {
  const { t, i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));
  const { message } = App.useApp();
  const hub = desktopLights();

  const [hubBusy, setHubBusy] = useState<'enable' | 'disable' | null>(null);
  const [tokenIssuing, setTokenIssuing] = useState(false);
  // Alohida agent tokeni — faqat xotirada va faqat bir marta ko'rsatiladi
  const [token, setToken] = useState<string | null>(null);

  const anyBusy = busy || hubBusy !== null || tokenIssuing;
  const hubInfo = hubStatus?.hub ?? null;
  const hubEnabled = hubStatus?.enabled === true;

  /**
   * Markazni yoqish: rejim "Klub kompyuteri" bo'ladi, yangi token beriladi va
   * u FAQAT Windows shifrlash (DPAPI) bilan kompyuterda saqlanadi — token
   * ekranga chiqmaydi. Eski agent (bo'lsa) shu zahoti ulanishdan mahrum bo'ladi.
   */
  const enableHub = async () => {
    if (!hub || hubBusy) return;
    setHubBusy('enable');
    try {
      if (data.mode !== 'bridge') await lightsApi.updateSettings({ mode: 'bridge' });
      const res = await lightsApi.issueBridgeToken(t('lights.hubAgentName'));
      await hub.enable(res.data.token);
      message.success(t('lights.hubEnabled'));
      onChanged();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
      onChanged();
    } finally {
      setHubBusy(null);
    }
  };

  const disableHub = async () => {
    if (!hub || hubBusy) return;
    setHubBusy('disable');
    try {
      await hub.disable();
      message.success(t('lights.hubDisabled'));
      onChanged();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setHubBusy(null);
    }
  };

  const issueToken = async () => {
    if (tokenIssuing) return;
    setTokenIssuing(true);
    try {
      const res = await lightsApi.issueBridgeToken();
      setToken(res.data.token);
      message.success(res.message);
      onChanged();
    } catch (err) {
      message.error(lightErrorText(err, t('common.error')));
    } finally {
      setTokenIssuing(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      message.success(t('tables.lightsCopied'));
    } catch {
      message.error(copy.copiedError);
    }
  };

  const modeHint =
    data.mode === 'bridge' ? t('lights.modeBridgeHint') : data.mode === 'direct' ? t('lights.modeDirectHint') : t('lights.modeOffHint');

  /* ---------------------------------------------------- Kompyuter markazi */
  const hubPanel = hub && hubStatus && (
    <div className="light-hub">
      <div className="light-hub-head">
        <DesktopOutlined className="light-hub-icon" />
        <Text strong>{t('lights.hubTitle')}</Text>
        <Tag color={hubEnabled ? (hubStatus.running ? 'success' : 'processing') : 'default'} style={{ marginInlineEnd: 0 }}>
          {hubEnabled ? (hubStatus.running ? t('lights.hubOn') : t('lights.hubStarting')) : t('lights.hubOff')}
        </Tag>
      </div>

      {!hubStatus.available && (
        <Alert type="error" showIcon message={t('lights.hubUnavailable', { error: hubStatus.error ?? '—' })} />
      )}

      {hubEnabled ? (
        <>
          {hubInfo?.cloud.authFailed ? (
            <Alert
              type="error"
              showIcon
              message={t('lights.hubAuthFailed')}
              action={
                canEdit ? (
                  <Button size="small" loading={hubBusy === 'enable'} disabled={anyBusy} onClick={() => void enableHub()}>
                    {t('lights.hubReconnect')}
                  </Button>
                ) : undefined
              }
            />
          ) : hubInfo ? (
            <div className="light-hub-lines">
              <span className={hubInfo.cloud.online ? 'is-ok' : 'is-warn'}>
                {hubInfo.cloud.online ? <CheckCircleFilled /> : <WarningFilled />}
                {hubInfo.cloud.online ? t('lights.hubCloudOnline') : t('lights.hubCloudOffline')}
              </span>
              <span>{t('lights.hubTables', { n: hubInfo.tables.length })}</span>
              {hubInfo.cloud.lastOkAt && <span>{t('lights.hubLastSync', { time: formatDateTime(hubInfo.cloud.lastOkAt) })}</span>}
            </div>
          ) : null}
          {hubStatus.error && hubStatus.available && <Alert type="warning" showIcon message={hubStatus.error} />}
          <Text type="secondary" className="light-hub-note">{t('lights.hubBackground')}</Text>
          {canEdit && (
            <Popconfirm
              title={t('lights.hubDisableConfirm')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              okButtonProps={{ danger: true }}
              onConfirm={() => void disableHub()}
            >
              <Button danger loading={hubBusy === 'disable'} disabled={anyBusy} className="light-hub-action">
                {t('lights.hubDisable')}
              </Button>
            </Popconfirm>
          )}
        </>
      ) : (
        <>
          <Text type="secondary" className="light-hub-note">{t('lights.hubIntro')}</Text>
          {data.bridge.online && (
            <Alert type="warning" showIcon message={t('lights.hubOtherAgent', { version: data.bridge.agentVersion ?? '—' })} />
          )}
          {hubStatus.available && !hubStatus.encryption && <Alert type="error" showIcon message={t('lights.hubNoEncryption')} />}
          {data.mode !== 'bridge' && <Text type="secondary" className="light-hub-note">{t('lights.hubNeedsBridge')}</Text>}
          {canEdit && (
            <Popconfirm
              title={t('lights.hubEnableConfirm')}
              description={<span className="light-popconfirm-text">{t('lights.hubEnableConfirmDesc')}</span>}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              disabled={!hubStatus.available || !hubStatus.encryption}
              onConfirm={() => void enableHub()}
            >
              <Button
                type="primary"
                icon={<DesktopOutlined />}
                loading={hubBusy === 'enable'}
                disabled={anyBusy || !hubStatus.available || !hubStatus.encryption}
                className="light-hub-action"
              >
                {t('lights.hubEnable')}
              </Button>
            </Popconfirm>
          )}
        </>
      )}
    </div>
  );

  /* ------------------------------------------------------- Alohida agent */
  const agentPanel = (
    <div className="light-agent">
      <Space size={8} wrap>
        <Tag color={data.bridge.online ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
          {data.bridge.online ? t('tables.lightsBridgeOnline') : t('tables.lightsBridgeOffline')}
        </Tag>
        {data.bridge.exists ? (
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {t('tables.lightsLastSeen')}: {formatDateTime(data.bridge.lastSeenAt)} · {t('tables.lightsAgentVersion')}:{' '}
            {data.bridge.agentVersion ?? '—'}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12.5 }}>{t('tables.lightsBridgeNone')}</Text>
        )}
      </Space>
      <Paragraph type="secondary" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{t('lights.agentHint')}</Paragraph>
      {canEdit && (
        <Popconfirm
          title={t('tables.lightsTokenConfirmTitle')}
          description={<span className="light-popconfirm-text">{t('tables.lightsTokenConfirmDesc')}</span>}
          okText={t('common.yes')}
          cancelText={t('common.no')}
          onConfirm={() => void issueToken()}
        >
          <Button icon={<KeyOutlined />} loading={tokenIssuing} disabled={anyBusy} style={{ marginTop: 10 }}>
            {t('tables.lightsIssueToken')}
          </Button>
        </Popconfirm>
      )}
      {token && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 10 }}
          message={t('tables.lightsTokenOnce')}
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text code style={{ wordBreak: 'break-all' }}>{token}</Text>
              <Space size={8}>
                <Button size="small" icon={<CopyOutlined />} onClick={() => void copyToken()}>
                  {t('tables.lightsCopy')}
                </Button>
                <Button size="small" type="text" onClick={() => setToken(null)}>
                  {t('btn.close')}
                </Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('tables.lightsTokenHint')}</Text>
            </Space>
          }
        />
      )}
    </div>
  );

  return (
    <section className="light-section">
      <div className="light-section-head">
        <Text strong>{t('lights.ctrlTitle')}</Text>
      </div>
      <Text type="secondary" className="light-section-hint">{t('lights.ctrlIntro')}</Text>

      <div className="light-mode">
        <Text type="secondary" className="light-field-label">{t('lights.modeLabel')}</Text>
        <Radio.Group
          value={data.mode}
          disabled={anyBusy || !canEdit}
          optionType="button"
          buttonStyle="solid"
          onChange={(e) => onSaveMode(e.target.value as LightMode)}
          options={[
            { value: 'off', label: t('lights.modeOff') },
            { value: 'bridge', label: t('lights.modeBridge') },
            { value: 'direct', label: t('lights.modeDirect') },
          ]}
        />
        <Text type="secondary" className="light-section-hint">{modeHint}</Text>
      </div>

      {hub ? (
        hubPanel
      ) : (
        <Alert
          type="info"
          showIcon
          message={t('lights.hubBrowserTitle')}
          description={
            <>
              <span>{t('lights.hubBrowserHint')}</span>
              <div style={{ marginTop: 8 }}>
                <Button size="small" icon={<DownloadOutlined />} href="/download" target="_blank" rel="noopener">
                  {t('lights.hubDownload')}
                </Button>
              </div>
            </>
          }
        />
      )}

      <Collapse
        ghost
        className="light-agent-collapse"
        defaultActiveKey={!hub && data.mode === 'bridge' && data.bridge.exists ? ['agent'] : []}
        items={[{ key: 'agent', label: t('lights.agentTitle'), children: agentPanel }]}
      />
    </section>
  );
};

export default LightControllerCard;
