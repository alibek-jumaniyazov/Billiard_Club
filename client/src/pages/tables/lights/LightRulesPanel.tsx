import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, InputNumber, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { LightSettingsPayload, LightsOverview } from '../../../types';

const { Text } = Typography;

interface NumbersDraft {
  offDelaySec: number;
  preOnMinutes: number;
  forceSyncSec: number;
}

/** Sozlama qatori: chapda nom + tushuntirish, o'ngda boshqaruv */
const SettingRow = ({ label, hint, control }: { label: string; hint: string; control: ReactNode }) => (
  <div className="light-setting-row">
    <div style={{ minWidth: 0 }}>
      <Text style={{ display: 'block' }}>{label}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>
    </div>
    <div style={{ flexShrink: 0 }}>{control}</div>
  </div>
);

export interface LightRulesPanelProps {
  data: LightsOverview;
  canEdit: boolean;
  saving: boolean;
  /** true — saqlandi */
  onSave: (patch: Partial<LightSettingsPayload>) => Promise<boolean>;
}

/**
 * QOIDALAR: pauza, sessiya tugagach kechikish, bron oldidan yoqish, qayta
 * tekshirish oralig'i va holatni o'qib tekshirish. Raqamli maydonlar fokus
 * yo'qolganda va faqat qiymat o'zgargan bo'lsa saqlanadi.
 */
const LightRulesPanel = ({ data, canEdit, saving, onSave }: LightRulesPanelProps) => {
  const { t } = useTranslation();
  const [numbers, setNumbers] = useState<NumbersDraft>({
    offDelaySec: data.offDelaySec,
    preOnMinutes: data.preOnMinutes,
    forceSyncSec: data.forceSyncSec,
  });

  /* Serverdagi qiymat o'zgargandagina qoralama yangilanadi (davriy yangilash yozilayotganni bosmaydi) */
  useEffect(() => {
    setNumbers({ offDelaySec: data.offDelaySec, preOnMinutes: data.preOnMinutes, forceSyncSec: data.forceSyncSec });
  }, [data.offDelaySec, data.preOnMinutes, data.forceSyncSec]);

  /**
   * Enter bosilganda blur ham ishga tushadi — AYNI qiymat ikki marta
   * yuborilmasligi uchun oxirgi yuborilgani eslab qolinadi.
   */
  const sent = useRef<Partial<NumbersDraft>>({});

  const commit = (field: keyof NumbersDraft) => {
    const value = numbers[field];
    if (value === data[field] || sent.current[field] === value) return;
    sent.current[field] = value;
    void onSave({ [field]: value }).then((ok) => {
      if (sent.current[field] === value) delete sent.current[field];
      if (!ok) setNumbers((prev) => ({ ...prev, [field]: data[field] }));
    });
  };

  const disabled = data.mode === 'off' || !canEdit || saving;

  const numberInput = (field: keyof NumbersDraft, min: number, max: number, step: number, unit: string, label: string) => (
    <InputNumber
      value={numbers[field]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      suffix={unit}
      aria-label={label}
      onChange={(value) => setNumbers((prev) => ({ ...prev, [field]: value ?? min }))}
      onBlur={() => commit(field)}
      onPressEnter={() => commit(field)}
      style={{ width: 140 }}
    />
  );

  return (
    <section className="light-section">
      <Alert type="info" showIcon message={t('lights.rulesIntro')} />
      {!canEdit && <Alert type="info" showIcon message={t('tables.lightsReadOnly')} style={{ marginTop: 10 }} />}
      {data.mode === 'off' && <Alert type="warning" showIcon message={t('lights.offTitle')} style={{ marginTop: 10 }} />}

      <SettingRow
        label={t('tables.lightsOffOnPause')}
        hint={t('tables.lightsOffOnPauseHint')}
        control={
          <Switch checked={data.offOnPause} loading={saving} disabled={disabled} onChange={(checked) => void onSave({ offOnPause: checked })} />
        }
      />
      <SettingRow
        label={t('tables.lightsOffDelay')}
        hint={t('tables.lightsOffDelayHint')}
        control={numberInput('offDelaySec', 0, 3600, 30, t('tables.lightsSeconds'), t('tables.lightsOffDelay'))}
      />
      <SettingRow
        label={t('tables.lightsPreOn')}
        hint={t('tables.lightsPreOnHint')}
        control={numberInput('preOnMinutes', 0, 120, 5, t('tables.lightsMinutes'), t('tables.lightsPreOn'))}
      />
      <SettingRow
        label={t('lights.rulesForceSync')}
        hint={t('lights.rulesForceSyncHint')}
        control={numberInput('forceSyncSec', 10, 3600, 10, t('tables.lightsSeconds'), t('lights.rulesForceSync'))}
      />
      <SettingRow
        label={t('lights.rulesVerify')}
        hint={t('lights.rulesVerifyHint')}
        control={<Switch checked={data.verify} loading={saving} disabled={disabled} onChange={(checked) => void onSave({ verify: checked })} />}
      />
    </section>
  );
};

export default LightRulesPanel;
