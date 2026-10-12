import type { CSSProperties, ReactNode } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { BulbOutlined, PoweroffOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TOKENS } from '../../../theme/tokens';
import type { LightDeviceConfig, LightDriver, LightMode, TableLightConfig } from '../../../types';
import { formatDateTime } from '../../../utils/format';
import {
  DRIVER_OPTIONS,
  driverFields,
  isBridgeOnly,
  numberStyle,
  panelStyle,
  type TableDraft,
} from './shared';
import { hasLightChanges, lightDraftIssue, lightHealth } from './light-health';
import { lightCopy } from './light-copy';

const { Text } = Typography;

/** Maydon uslubi: tepasida kichik yorliq, ostida input */
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 };

const Field = ({
  label,
  grow,
  width,
  children,
}: {
  label: string;
  /** Bo'sh joyni egallasin (flex: 1) */
  grow?: boolean;
  width?: number;
  children: ReactNode;
}) => (
  <label style={{ ...fieldStyle, flex: grow ? '1 1 180px' : `0 1 ${width ?? 120}px` }}>
    <Text type="secondary" style={{ fontSize: 11.5 }}>
      {label}
    </Text>
    {children}
  </label>
);

export interface TableLightCardProps {
  row: TableLightConfig;
  draft: TableDraft;
  /** Klub rejimi — 'off' da sinov tugmalari o'chirilgan */
  mode: LightMode;
  bridgeOnline: boolean;
  forceSyncSec: number;
  serverNow: number;
  busy?: boolean;
  /** Sozlamalarni tahrirlash huquqi (admin/superadmin) */
  canEdit: boolean;
  /** Qidiruvdan qoralama yozilgan karta — foydalanuvchi diqqatini tortish uchun ajratiladi */
  highlight?: boolean;
  saving: boolean;
  testing: boolean;
  overriding: boolean;
  onPatch: (patch: Partial<TableDraft>) => void;
  onPatchConfig: (patch: Partial<LightDeviceConfig>) => void;
  onSave: () => void;
  onReset: () => void;
  onTest: (on: boolean) => void;
  /** on=null — avtomatikaga qaytaradi */
  onOverride: (on: boolean | null) => void;
}

/**
 * Bitta stolning chiroq kartasi: holat, drayver tanlash, drayverga MOS
 * maydonlar, "Qo'shimcha" (kanallar, teskari rele, parol, tekshirish) va
 * amallar (sinov, saqlash, qo'lda boshqarish).
 */
const TableLightCard = ({
  row,
  draft,
  mode,
  bridgeOnline,
  forceSyncSec,
  serverNow,
  busy = false,
  canEdit,
  highlight = false,
  saving,
  testing,
  overriding,
  onPatch,
  onPatchConfig,
  onSave,
  onReset,
  onTest,
  onOverride,
}: TableLightCardProps) => {
  const { t, i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));

  const fields = driverFields(draft.driver);
  const configured = draft.driver !== 'none';
  const bridgeOnly = isBridgeOnly(draft.driver);
  /** 'direct' rejimda bridge-only drayver ishlamaydi — server ham rad etadi */
  const driverBlocked = bridgeOnly && mode === 'direct';
  const dirty = hasLightChanges(row, draft);
  const issue = lightDraftIssue(draft);
  const unavailable = mode === 'bridge' && !bridgeOnline;
  const testDisabled = !canEdit || row.driver === 'none' || mode === 'off' || driverBlocked || unavailable || dirty || busy || !row.isActive;
  const testHint = dirty ? copy.unsaved : testDisabled ? t('tables.lightsTestDisabled') : t('tables.lightsTestHint');
  /** Qo'lda yoqish/o'chirish kassir va operatorga ham ochiq (canEdit shart emas) */
  const toggleDisabled = mode === 'off' || row.driver === 'none' || driverBlocked || unavailable || dirty || busy || !row.isActive;
  const health = lightHealth(row, mode, bridgeOnline, forceSyncSec, serverNow);
  const healthColor = health === 'confirmed' ? 'success' : health === 'error' ? 'error'
    : ['unconfigured', 'disabled'].includes(health) ? 'default' : 'warning';

  /* Oxirgi ma'lum holat: yoniq — oltin, o'chiq — kulrang, xato — qizil */
  const stateColor = row.error
    ? TOKENS.color.semantic.error
    : row.state === true
      ? TOKENS.color.gold.base
      : row.state === false
        ? TOKENS.color.text.tertiary
        : TOKENS.color.text.disabled;
  const stateLabel = row.state === true
      ? t('tables.lightsStateOn')
      : row.state === false
        ? t('tables.lightsStateOff')
        : copy.unknown;
  const stateHint =
    row.error ??
    (row.syncedAt ? `${t('tables.lightsSyncedAt')}: ${formatDateTime(row.syncedAt)}` : undefined);

  const driverOptions = DRIVER_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.brand ?? t(opt.i18nKey ?? ''),
  }));

  const verifyValue: 'inherit' | 'on' | 'off' =
    draft.config.verify === undefined ? 'inherit' : draft.config.verify ? 'on' : 'off';

  /* --------------------------------------------- Drayverga MOS maydonlar */
  const mainFields: ReactNode[] = [];
  if (fields.host) {
    mainFields.push(
      <Field key="host" label={t('tables.lightsHost')} grow>
        <Input
          value={draft.host}
          maxLength={120}
          disabled={!canEdit || busy}
          placeholder={draft.driver === 'tcp' ? '192.168.1.60:8080' : '192.168.1.51'}
          onChange={(e) => onPatch({ host: e.target.value })}
        />
      </Field>,
    );
  }
  if (fields.channel) {
    mainFields.push(
      <Field key="channel" label={t('tables.lightsChannel')} width={92}>
        <InputNumber
          value={draft.channel}
          min={0}
          max={32}
          disabled={!canEdit || busy}
          onChange={(value) => onPatch({ channel: value ?? 0 })}
          style={{ width: '100%' }}
        />
      </Field>,
    );
  }
  if (fields.entityId) {
    mainFields.push(
      <Field key="entityId" label={t('tables.lightsEntityId')} grow>
        <Input
          value={draft.config.entityId ?? ''}
          maxLength={120}
          disabled={!canEdit || busy}
          placeholder="switch.stol_3"
          onChange={(e) => onPatchConfig({ entityId: e.target.value })}
        />
      </Field>,
    );
  }
  if (fields.entity) {
    mainFields.push(
      <Field key="entity" label={t('tables.lightsEntity')} grow>
        <Input
          value={draft.config.entity ?? ''}
          maxLength={60}
          disabled={!canEdit || busy}
          placeholder="relay_1"
          onChange={(e) => onPatchConfig({ entity: e.target.value })}
        />
      </Field>,
    );
  }
  if (fields.mqtt) {
    mainFields.push(
      <Field key="topic" label={t('tables.lightsTopic')} grow>
        <Input
          value={draft.config.topic ?? ''}
          maxLength={200}
          disabled={!canEdit || busy}
          placeholder="zigbee2mqtt/stol3/set"
          onChange={(e) => onPatchConfig({ topic: e.target.value })}
        />
      </Field>,
      <Field key="onPayload" label={t('tables.lightsOnPayload')} width={110}>
        <Input
          value={draft.config.onPayload ?? ''}
          maxLength={120}
          disabled={!canEdit || busy}
          placeholder="ON"
          onChange={(e) => onPatchConfig({ onPayload: e.target.value })}
        />
      </Field>,
      <Field key="offPayload" label={t('tables.lightsOffPayload')} width={110}>
        <Input
          value={draft.config.offPayload ?? ''}
          maxLength={120}
          disabled={!canEdit || busy}
          placeholder="OFF"
          onChange={(e) => onPatchConfig({ offPayload: e.target.value })}
        />
      </Field>,
      <Field key="stateTopic" label={t('tables.lightsStateTopic')} grow>
        <Input
          value={draft.config.stateTopic ?? ''}
          maxLength={200}
          disabled={!canEdit || busy}
          placeholder="zigbee2mqtt/stol3"
          onChange={(e) => onPatchConfig({ stateTopic: e.target.value })}
        />
      </Field>,
    );
  }
  if (fields.modbus) {
    mainFields.push(
      <Field key="unitId" label={t('tables.lightsUnitId')} width={92}>
        <InputNumber
          value={draft.config.unitId ?? null}
          min={0}
          max={247}
          disabled={!canEdit || busy}
          placeholder="1"
          onChange={(value) => onPatchConfig({ unitId: value ?? undefined })}
          style={{ width: '100%' }}
        />
      </Field>,
      <Field key="coil" label={t('tables.lightsCoil')} width={100}>
        <InputNumber
          value={draft.config.coil ?? null}
          min={0}
          max={65535}
          disabled={!canEdit || busy}
          onChange={(value) => onPatchConfig({ coil: value ?? undefined })}
          style={{ width: '100%' }}
        />
      </Field>,
    );
  }
  if (fields.serial) {
    mainFields.push(
      <Field key="serialPort" label={t('tables.lightsSerialPort')} grow>
        <Input
          value={draft.config.serialPort ?? ''}
          maxLength={60}
          disabled={!canEdit || busy}
          placeholder="COM3"
          onChange={(e) => onPatchConfig({ serialPort: e.target.value })}
        />
      </Field>,
    );
  }
  if (fields.raw) {
    mainFields.push(
      <Field key="onHex" label={t('tables.lightsOnHex')} grow>
        <Input
          value={draft.config.onHex ?? ''}
          maxLength={200}
          disabled={!canEdit || busy}
          placeholder="A0 01 01 A2"
          onChange={(e) => onPatchConfig({ onHex: e.target.value })}
        />
      </Field>,
      <Field key="offHex" label={t('tables.lightsOffHex')} grow>
        <Input
          value={draft.config.offHex ?? ''}
          maxLength={200}
          disabled={!canEdit || busy}
          placeholder="A0 01 00 A1"
          onChange={(e) => onPatchConfig({ offHex: e.target.value })}
        />
      </Field>,
    );
  }

  /* --------------------------------------------------------- Qo'shimcha */
  const advanced = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Field label={t('tables.lightsChannels')} grow>
        <Tooltip title={t('tables.lightsChannelsHint')}>
          <Input
            value={draft.channelsText}
            maxLength={40}
            disabled={!canEdit || busy}
            placeholder="1, 2"
            onChange={(e) => onPatch({ channelsText: e.target.value })}
          />
        </Tooltip>
      </Field>

      {fields.auth && (
        <Field label={fields.authHa ? t('tables.lightsAuthHa') : t('tables.lightsAuth')} grow>
          <Tooltip title={row.hasAuth ? t('tables.lightsAuthKeep') : undefined}>
            <Input.Password
              value={draft.auth}
              /* Server DTO va `tables."lightAuth"` ustuni — 200 belgi */
              maxLength={200}
              disabled={!canEdit || busy}
              autoComplete="new-password"
              placeholder={row.hasAuth ? '••••••••' : fields.authHa ? 'eyJhbGci…' : 'admin:parol'}
              onChange={(e) => onPatch({ auth: e.target.value })}
            />
          </Tooltip>
        </Field>
      )}

      <Field label={t('tables.lightsVerify')} width={160}>
        <Select<'inherit' | 'on' | 'off'>
          value={verifyValue}
          disabled={!canEdit || busy}
          onChange={(value) =>
            onPatchConfig({ verify: value === 'inherit' ? undefined : value === 'on' })
          }
          options={[
            { value: 'inherit', label: t('tables.lightsVerifyInherit') },
            { value: 'on', label: t('common.yes') },
            { value: 'off', label: t('common.no') },
          ]}
          style={{ width: '100%' }}
        />
      </Field>

      {fields.mqtt && (
        <>
          <Field label={t('tables.lightsStateOnValue')} width={130}>
            <Input
              value={draft.config.stateOnValue ?? ''}
              maxLength={120}
              disabled={!canEdit || busy}
              placeholder="ON"
              onChange={(e) => onPatchConfig({ stateOnValue: e.target.value })}
            />
          </Field>
          <Field label={t('tables.lightsQos')} width={90}>
            <Select<0 | 1>
              value={draft.config.qos === 1 ? 1 : 0}
              disabled={!canEdit || busy}
              onChange={(value) => onPatchConfig({ qos: value })}
              options={[
                { value: 0, label: '0' },
                { value: 1, label: '1' },
              ]}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label={t('tables.lightsRetain')} width={90}>
            <Switch
              checked={draft.config.retain === true}
              disabled={!canEdit || busy}
              onChange={(checked) => onPatchConfig({ retain: checked })}
            />
          </Field>
        </>
      )}

      {fields.raw && (
        <>
          <Field label={t('tables.lightsOnAscii')} grow>
            <Input
              value={draft.config.onAscii ?? ''}
              maxLength={200}
              disabled={!canEdit || busy}
              placeholder="ON\r\n"
              onChange={(e) => onPatchConfig({ onAscii: e.target.value })}
            />
          </Field>
          <Field label={t('tables.lightsOffAscii')} grow>
            <Input
              value={draft.config.offAscii ?? ''}
              maxLength={200}
              disabled={!canEdit || busy}
              placeholder="OFF\r\n"
              onChange={(e) => onPatchConfig({ offAscii: e.target.value })}
            />
          </Field>
          <Field label={t('tables.lightsExpectHex')} width={150}>
            <Input
              value={draft.config.expectHex ?? ''}
              maxLength={200}
              disabled={!canEdit || busy}
              onChange={(e) => onPatchConfig({ expectHex: e.target.value })}
            />
          </Field>
        </>
      )}

      {fields.serial && (
        <Field label={t('tables.lightsBaudRate')} width={120}>
          <InputNumber
            value={draft.config.baudRate ?? null}
            min={300}
            max={921600}
            disabled={!canEdit || busy}
            placeholder="9600"
            onChange={(value) => onPatchConfig({ baudRate: value ?? undefined })}
            style={{ width: '100%' }}
          />
        </Field>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 100%' }}>
        <Switch
          size="small"
          checked={draft.inverted}
          disabled={!canEdit || busy}
          onChange={(checked) => onPatch({ inverted: checked })}
        />
        <Text style={{ fontSize: 12.5 }}>{t('tables.lightsInverted')}</Text>
      </div>
    </div>
  );

  return (
    <div
      className="light-table-card"
      style={
        /* Ajratilgan karta — qidiruvdan qoralama tushgani ko'rinib tursin */
        highlight
          ? {
              ...panelStyle,
              borderColor: TOKENS.color.gold.line,
              boxShadow: `0 0 0 2px ${TOKENS.color.gold.subtle}`,
            }
          : panelStyle
      }
    >
      {/* Sarlavha: raqam + nom + oxirgi holat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={numberStyle} className="tabular-nums">
          {row.tableNumber}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text strong ellipsis style={{ display: 'block' }}>
            {row.tableName}
          </Text>
          <Tag color={healthColor} style={{ marginTop: 5, whiteSpace: 'normal' }}>{copy.health[health]}</Tag>
          <Tooltip title={stateHint}>
            <span
              style={{
                color: stateColor,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
              }}
            >
              <BulbOutlined />
              {copy.reported}: {stateLabel}
            </span>
          </Tooltip>
          {row.syncedAt && (
            <Text type="secondary" style={{ fontSize: 11.5, marginInlineStart: 8 }}>
              {t('tables.lightsSyncedAt')}: {formatDateTime(row.syncedAt)}
            </Text>
          )}
        </div>
        {row.overrideActive && (
          <Tooltip
            title={`${t('tables.lightsOverrideUntil')}: ${formatDateTime(row.overrideUntil)} · ${t(
              'tables.lightsOverrideClear',
            )}`}
          >
            <Tag
              color="gold"
              closable={!busy}
              style={{ marginInlineEnd: 0 }}
              onClose={(e) => {
                e.preventDefault();
                onOverride(null);
              }}
            >
              {row.overrideOn ? t('tables.lightsOverrideOn') : t('tables.lightsOverrideOff')}
            </Tag>
          </Tooltip>
        )}
      </div>

      {row.driver !== 'none' && (
        <div className="light-state-strip">
          <span>{copy.desired}: <strong>{typeof row.desired === 'boolean' ? row.desired ? copy.on : copy.off : '—'}</strong></span>
          <span>{row.overrideActive ? `${row.overrideOn ? copy.on : copy.off} → ${formatDateTime(row.overrideUntil)}` : copy.auto}</span>
        </div>
      )}
      {row.error && <Alert type="error" showIcon style={{ marginTop: 10 }} message={row.error} description={copy.errorsHint} />}
      {dirty && <Alert type="info" showIcon style={{ marginTop: 10 }} message={copy.unsaved} />}
      {dirty && issue && <Alert type="warning" showIcon style={{ marginTop: 10 }} message={copy.issues[issue]} />}

      {/* Drayver + unga MOS maydonlar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        <Field label={t('tables.lightsDriverPreset')} width={186}>
          <Select<LightDriver>
            value={draft.driver}
            options={driverOptions}
            disabled={!canEdit || busy}
            onChange={(value) => onPatch({ driver: value })}
            style={{ width: '100%' }}
          />
        </Field>
        {mainFields}
      </div>

      {configured && fields.urls && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <Input
            value={draft.onUrl}
            maxLength={500}
            disabled={!canEdit || busy}
            addonBefore={t('tables.lightsOnUrl')}
            placeholder="http://192.168.1.51/relay/{channel}?turn=on"
            onChange={(e) => onPatch({ onUrl: e.target.value })}
          />
          <Input
            value={draft.offUrl}
            maxLength={500}
            disabled={!canEdit || busy}
            addonBefore={t('tables.lightsOffUrl')}
            placeholder="http://192.168.1.51/relay/{channel}?turn=off"
            onChange={(e) => onPatch({ offUrl: e.target.value })}
          />
        </div>
      )}

      {driverBlocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 10 }}
          message={t('tables.lightsBridgeOnly')}
        />
      )}

      {configured && (
        <Collapse
          ghost
          size="small"
          style={{ marginTop: 4 }}
          items={[
            {
              key: 'advanced',
              label: <Text style={{ fontSize: 12.5 }}>{t('tables.lightsAdvanced')}</Text>,
              children: advanced,
            },
          ]}
        />
      )}

      {/* Amallar */}
      <div
        className="light-card-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          flexWrap: 'wrap',
        }}
      >
        <Space size={6} wrap>
          {/* O'chirilgan tugma pointer hodisalarini yubormaydi — Tooltip ko'rinishi
              uchun tugma <span> ichiga o'raladi (sinov tugmalaridagi kabi) */}
          <Tooltip title={toggleDisabled ? t('tables.lightsTestDisabled') : t('tables.lightsToggleOn')}>
            <span style={{ display: 'inline-flex' }}>
              <Button
                icon={<BulbOutlined />}
                disabled={toggleDisabled}
                loading={overriding}
                onClick={() => onOverride(true)}
              >
                {t('tables.lightsToggleOn')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={dirty ? copy.unsaved : toggleDisabled ? t('tables.lightsTestDisabled') : t('tables.lightsToggleOff')}>
            <span style={{ display: 'inline-flex' }}>
              <Popconfirm title={copy.activeOff} disabled={!row.sessionStatus || toggleDisabled} onConfirm={() => onOverride(false)} okText={t('common.yes')} cancelText={t('common.no')}>
              <Button
                icon={<PoweroffOutlined />}
                disabled={toggleDisabled}
                loading={overriding}
                onClick={() => { if (!row.sessionStatus) onOverride(false); }}
              >
                {t('tables.lightsToggleOff')}
              </Button>
              </Popconfirm>
            </span>
          </Tooltip>
          {row.overrideActive && (
            <Tooltip title={t('tables.lightsOverrideAuto')}>
              <Button
                type="text"
                icon={<SyncOutlined />}
                loading={overriding}
                disabled={busy}
                onClick={() => onOverride(null)}
              >
                {copy.auto}
              </Button>
            </Tooltip>
          )}
        </Space>

        {canEdit && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Disabled tugma hodisa yubormaydi — sabab ko'rinishi uchun
                Tooltip span ichidagi tugmani o'raydi */}
            <Tooltip title={testHint}>
              <span style={{ display: 'inline-flex' }}>
                <Popconfirm title={copy.activeTest} disabled={!row.sessionStatus || testDisabled} onConfirm={() => onTest(true)} okText={t('common.yes')} cancelText={t('common.no')}>
                <Button
                  icon={<BulbOutlined />}
                  disabled={testDisabled}
                  loading={testing}
                  onClick={() => { if (!row.sessionStatus) onTest(true); }}
                >
                  {copy.testOn}
                </Button>
                </Popconfirm>
              </span>
            </Tooltip>
            <Tooltip title={testHint}>
              <span style={{ display: 'inline-flex' }}>
                <Popconfirm title={copy.activeTest} disabled={!row.sessionStatus || testDisabled} onConfirm={() => onTest(false)} okText={t('common.yes')} cancelText={t('common.no')}>
                <Button
                  icon={<PoweroffOutlined />}
                  disabled={testDisabled}
                  loading={testing}
                  onClick={() => { if (!row.sessionStatus) onTest(false); }}
                >
                  {copy.testOff}
                </Button>
                </Popconfirm>
              </span>
            </Tooltip>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!dirty || !!issue || busy}
              onClick={onSave}
            >
              {t('btn.save')}
            </Button>
            {dirty && <Button type="text" disabled={busy} onClick={onReset}>{copy.discard}</Button>}
          </div>
        )}
      </div>
      {row.driver !== 'none' && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>{copy.overrideHint}</Text>}
    </div>
  );
};

export default TableLightCard;
