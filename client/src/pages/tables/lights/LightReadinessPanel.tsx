import { Collapse, Tag, Typography } from 'antd';
import { ApiOutlined, CheckCircleOutlined, LinkOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { LightsOverview } from '../../../types';
import { lightCopy } from './light-copy';
import { lightHealth, needsLightAttention } from './light-health';

export default function LightReadinessPanel({ data, now }: { data: LightsOverview; now: number }) {
  const { i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));
  const configured = data.tables.filter((r) => r.driver !== 'none' && r.isActive).length;
  const states = data.tables.map((r) => lightHealth(r, data.mode, data.bridge.online, data.forceSyncSec, now));
  const steps = [
    { icon: <ApiOutlined />, title: copy.networkTitle, text: copy.network },
    { icon: <LinkOutlined />, title: copy.relayTitle, text: copy.relay },
    { icon: <CheckCircleOutlined />, title: copy.testTitle, text: copy.test },
  ];
  return <section className="light-readiness">
    <div className="light-readiness-heading">
      <div><span className="light-eyebrow">LIGHT CONTROL</span><Typography.Title level={3}>{copy.title}</Typography.Title></div>
      <SafetyCertificateOutlined className="light-readiness-icon" />
    </div>
    <Typography.Paragraph type="secondary">{copy.intro}</Typography.Paragraph>
    <div className="light-metrics">
      <div><strong>{configured}<small> / {data.tables.length}</small></strong><span>{copy.configured}</span></div>
      <div><strong>{states.filter((s) => s === 'confirmed').length}</strong><span>{copy.confirmed}</span></div>
      <div><strong>{states.filter(needsLightAttention).length}</strong><span>{copy.attention}</span></div>
    </div>
    <Collapse ghost defaultActiveKey={configured === 0 || data.mode === 'off' ? ['setup'] : []} items={[{
      key: 'setup', label: copy.guide,
      children: <div className="light-setup-steps">{steps.map((s) => <div key={s.title}><Tag>{s.icon}</Tag><div><strong>{s.title}</strong><p>{s.text}</p></div></div>)}</div>,
    }]} />
  </section>;
}
