import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  TimePicker,
  Typography,
} from 'antd';
import {
  ArrowRightOutlined,
  CalculatorOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  GlobalOutlined,
  PhoneOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, settingsApi } from '../api';
import { EmptyState, PageHeader, PageTransition } from '../components/ui';
import { useAppSettings, useCurrency } from '../context/AppSettingsContext';
import { TOKENS } from '../theme/tokens';
import type { Settings as ClubSettings } from '../types';
import { formatNumber, moneyFormatter, moneyParser } from '../utils/format';
import {
  DEFAULT_ROUNDING_STEP,
  normalizeRoundingStep,
  roundToStep,
  TABLE_ROUNDING_STEPS,
} from '../utils/rounding';

const { Text } = Typography;

/**
 * Zaxira ro'yxat — server validatsiyasidagi SUPPORTED_TIMEZONES bilan BIR XIL
 * (server/src/modules/settings/timezones.ts). Asosiy manba GET /settings/timezones,
 * bu ro'yxat faqat so'rov muvaffaqiyatsiz bo'lsa ishlatiladi.
 */
const FALLBACK_TIMEZONES = [
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Asia/Baku',
  'Asia/Yerevan',
  'Asia/Tbilisi',
  'Europe/Moscow',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Europe/Kiev',
  'Europe/Istanbul',
  'Asia/Dubai',
] as const;

/** "Asia/Tashkent" -> "Asia/Tashkent (GMT+5)" — brauzer qo'llamasa nomning o'zi */
const timezoneLabel = (tz: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    } as Intl.DateTimeFormatOptions).formatToParts(new Date());
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value;
    return offset ? `${tz} (${offset})` : tz;
  } catch {
    return tz;
  }
};

interface SettingsFormValues {
  clubName: string;
  phone: string | null;
  address: string | null;
  currency: string;
  currencySymbol: string;
  defaultTablePrice: number;
  /** Stolda yig'ilgan pulni yaxlitlash — kalit */
  roundingEnabled: boolean;
  /** Tanlangan qadam (kalit o'chiq bo'lsa ham eslab qolinadi, serverga 0 ketadi) */
  tableRoundingStep: number;
  timezone: string;
  workingHoursStart: Dayjs | null;
  workingHoursEnd: Dayjs | null;
}

/** Serverdagi 'HH:mm' satrlarini forma uchun dayjs ga aylantiradi */
const toFormValues = (s: ClubSettings): SettingsFormValues => {
  const step = normalizeRoundingStep(s.tableRoundingStep);
  return {
    clubName: s.clubName,
    phone: s.phone,
    address: s.address,
    currency: s.currency,
    currencySymbol: s.currencySymbol,
    defaultTablePrice: s.defaultTablePrice,
    roundingEnabled: step > 0,
    tableRoundingStep: step > 0 ? step : DEFAULT_ROUNDING_STEP,
    timezone: s.timezone,
    workingHoursStart: s.workingHoursStart ? dayjs(s.workingHoursStart, 'HH:mm') : null,
    workingHoursEnd: s.workingHoursEnd ? dayjs(s.workingHoursEnd, 'HH:mm') : null,
  };
};

/**
 * Tanlangan qadam uchun ikkita jonli misol — biri yuqoriga, biri pastga
 * yaxlitlanadi (1 000 da aynan egasining misoli: 46 800 → 47 000, 46 300 → 46 000).
 */
const roundingSamples = (step: number): Array<{ from: number; to: number }> => {
  const base = Math.floor(46000 / step) * step;
  return [base + step * 0.8, base + step * 0.3].map((from) => ({ from, to: roundToStep(from, step) }));
};

/** Karta sarlavhasi — ikonka oltin urg'u bilan */
const cardTitle = (icon: ReactNode, label: string) => (
  <Space size={8}>
    <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>{icon}</span>
    {label}
  </Space>
);

const Settings = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { setCurrencySymbol, setRoundingStep, setClubAddress } = useAppSettings();
  const currency = useCurrency();
  const [form] = Form.useForm<SettingsFormValues>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialValues, setInitialValues] = useState<SettingsFormValues | null>(null);
  const [timezones, setTimezones] = useState<readonly string[]>(FALLBACK_TIMEZONES);
  /**
   * Server yaxlitlashni qo'llab-quvvatlaydimi (javobda maydon bor). Yangi
   * sayt eski serverga tushib qolgan oraliqda karta ko'rinmaydi — aks holda
   * kalit "saqlandi" deb ko'rinib, server uni jimgina tashlab yuborardi.
   */
  const [roundingSupported, setRoundingSupported] = useState(false);

  // Narx maydonidagi belgi formadagi jonli qiymatga ergashadi (hali
  // saqlanmagan bo'lsa ham), aks holda ilovadagi joriy belgi ishlatiladi
  const watchedSymbol = Form.useWatch('currencySymbol', form);
  const priceCurrency = (watchedSymbol ?? '').trim() || currency;
  const roundingEnabled = Form.useWatch('roundingEnabled', form) ?? false;
  const watchedStep = normalizeRoundingStep(Form.useWatch('tableRoundingStep', form)) || DEFAULT_ROUNDING_STEP;

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda forma qayta
  // yaratilib, saqlanmagan o'zgarishlar yo'qolib ketmasin (xabar chaqirilgan
  // paytda ref orqali o'qiladi)
  const tRef = useRef(t);
  tRef.current = t;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await settingsApi.get();
      setRoundingSupported(res.data.tableRoundingStep !== undefined);
      setInitialValues(toFormValues(res.data));
    } catch (err) {
      // Xato holati saqlanadi — aks holda sahifa abadiy skeletda qolardi
      setLoadError(true);
      message.error(errorMessage(err, tRef.current('common.error')));
    } finally {
      setLoading(false);
    }
  }, [message]);

  // Ro'yxatni serverdan olamiz (validatsiya bilan bir manba); xatoda zaxira qoladi
  const fetchTimezones = useCallback(async () => {
    try {
      const res = await settingsApi.timezones();
      if (Array.isArray(res.data) && res.data.length > 0) setTimezones(res.data);
    } catch {
      // Zaxira ro'yxat yetarli — toast shart emas
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchTimezones();
  }, [fetchSettings, fetchTimezones]);

  const handleSave = async (values: SettingsFormValues) => {
    setSaving(true);
    // Kalit va qadam serverda BITTA maydon: 0 — o'chiq, aks holda qadam
    const { roundingEnabled: roundingOn, tableRoundingStep: chosenStep, ...rest } = values;
    try {
      const res = await settingsApi.update({
        ...rest,
        ...(roundingSupported
          ? { tableRoundingStep: roundingOn ? normalizeRoundingStep(chosenStep) || DEFAULT_ROUNDING_STEP : 0 }
          : {}),
        // dayjs -> 'HH:mm' (server satr kutadi). Serverda "ish vaqti yo'q"
        // holati YO'Q (ustun NOT NULL) — bo'sh maydon null emas, undefined
        // bo'lib ketadi, ya'ni qiymat umuman o'zgartirilmaydi.
        workingHoursStart: values.workingHoursStart?.isValid()
          ? values.workingHoursStart.format('HH:mm')
          : undefined,
        workingHoursEnd: values.workingHoursEnd?.isValid()
          ? values.workingHoursEnd.format('HH:mm')
          : undefined,
      });
      message.success(res.message);
      form.setFieldsValue(toFormValues(res.data));
      // Valyuta belgisi butun ilovada darhol yangilanadi
      setCurrencySymbol(res.data.currencySymbol);
      // Yaxlitlash qadami — internetsiz boshlanadigan o'yinlar ham shu bilan
      setRoundingStep(res.data.tableRoundingStep ?? 0);
      // Chekdagi klub manzili ham darhol yangilanadi
      setClubAddress(res.data.address);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<SettingOutlined />}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <div style={{ maxWidth: 920 }}>
        {loading ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : !initialValues ? (
          // Sozlamalar kelmadi — skeletda qotib qolmasdan qayta urinish taklif etiladi
          <Card>
            <EmptyState
              icon={<WarningOutlined />}
              title={t('settings.loadErrorTitle')}
              hint={loadError ? t('settings.loadErrorHint') : undefined}
              action={
                <Button type="primary" onClick={() => void fetchSettings()}>
                  {t('btn.refresh')}
                </Button>
              }
            />
          </Card>
        ) : (
          <Form<SettingsFormValues>
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onFinish={(values) => void handleSave(values)}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* Klub ma'lumotlari */}
              <Card title={cardTitle(<ShopOutlined />, t('settings.clubInfo'))}>
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="clubName"
                      label={t('settings.clubName')}
                      rules={[{ required: true, message: t('settings.clubNameRequired') }]}
                    >
                      <Input maxLength={150} placeholder="Billiard Club" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="phone" label={t('common.phone')}>
                      <Input
                        maxLength={20}
                        prefix={<PhoneOutlined />}
                        placeholder="+998 90 123 45 67"
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="address" label={t('settings.address')} style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} maxLength={300} />
                </Form.Item>
              </Card>

              {/* Valyuta va narx */}
              <Card title={cardTitle(<DollarOutlined />, t('settings.pricing'))}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item name="currency" label={t('settings.currency')}>
                      <Input maxLength={10} placeholder="UZS" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="currencySymbol" label={t('settings.currencySymbol')}>
                      <Input maxLength={10} placeholder={t('common.sum')} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="defaultTablePrice"
                      label={`${t('settings.defaultTablePrice')} (${priceCurrency})`}
                      rules={[{ required: true, message: t('settings.priceRequired') }]}
                    >
                      {/* Ming ajratkichi + valyuta belgisi — boshqa pul maydonlari
                          bilan bir xil (bitta ortiqcha nol darrov sezilsin) */}
                      <InputNumber
                        min={0}
                        step={1000}
                        style={{ width: '100%' }}
                        placeholder="40 000"
                        addonAfter={priceCurrency}
                        formatter={moneyFormatter}
                        parser={moneyParser}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              {/* Hisob-kitob: stolda yig'ilgan pulni yaxlitlash */}
              {roundingSupported && (
                <Card title={cardTitle(<CalculatorOutlined />, t('settings.billing'))}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>
                        {t('settings.tableRounding')}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {t('settings.tableRoundingHint')}
                      </Text>
                    </div>
                    <Form.Item name="roundingEnabled" valuePropName="checked" noStyle>
                      <Switch aria-label={t('settings.tableRounding')} style={{ flexShrink: 0, marginTop: 2 }} />
                    </Form.Item>
                  </div>

                  {/* Qadam o'chiq kalitda ham formada saqlanadi (yashirin) */}
                  <div style={{ display: roundingEnabled ? 'block' : 'none', marginTop: 16 }}>
                    {/* Valyuta yorliqda (narx maydoni bilan bir xil) — telefonda
                        to'rtta qadam ham to'liq ko'rinsin */}
                    <Form.Item
                      name="tableRoundingStep"
                      label={`${t('settings.tableRoundingStep')} (${priceCurrency})`}
                      style={{ marginBottom: 12 }}
                    >
                      <Segmented
                        block
                        options={TABLE_ROUNDING_STEPS.map((step) => ({
                          value: step,
                          label: formatNumber(step),
                        }))}
                      />
                    </Form.Item>
                    <div
                      style={{
                        background: TOKENS.color.bg.bg2,
                        border: `1px solid ${TOKENS.color.border.subtle}`,
                        borderRadius: TOKENS.radius.md,
                        padding: '10px 14px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '6px 20px',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {t('settings.tableRoundingExample')}:
                      </Text>
                      {roundingSamples(watchedStep).map(({ from, to }) => (
                        <span key={from} className="tabular-nums" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
                          {formatNumber(from)}
                          <ArrowRightOutlined
                            aria-hidden
                            style={{ fontSize: 11, margin: '0 8px', color: TOKENS.color.gold.base }}
                          />
                          <Text strong>{formatNumber(to)}</Text> {priceCurrency}
                        </span>
                      ))}
                    </div>
                    <ul
                      style={{
                        margin: '12px 0 0',
                        paddingInlineStart: 18,
                        color: TOKENS.color.text.secondary,
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      <li>{t('settings.tableRoundingNoteBar')}</li>
                      <li>{t('settings.tableRoundingNoteLive')}</li>
                      <li>{t('settings.tableRoundingNoteAudit')}</li>
                    </ul>
                  </div>
                </Card>
              )}

              {/* Vaqt mintaqasi */}
              <Card title={cardTitle(<GlobalOutlined />, t('settings.regional'))}>
                <Form.Item
                  name="timezone"
                  label={t('settings.timezone')}
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={timezones.map((tz) => ({ value: tz, label: timezoneLabel(tz) }))}
                  />
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('settings.timezoneHint')}
                </Text>
              </Card>

              {/* Ish vaqti */}
              <Card title={cardTitle(<ClockCircleOutlined />, t('settings.workingHours'))}>
                <Alert
                  type="info"
                  showIcon
                  message={t('settings.workingHoursNote')}
                  style={{ marginBottom: 16 }}
                />
                <Row gutter={12}>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="workingHoursStart"
                      label={t('settings.openTime')}
                      style={{ marginBottom: 0 }}
                    >
                      <TimePicker
                        format="HH:mm"
                        style={{ width: '100%' }}
                        placeholder="09:00"
                        allowClear={false}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="workingHoursEnd"
                      label={t('settings.closeTime')}
                      style={{ marginBottom: 0 }}
                    >
                      <TimePicker
                        format="HH:mm"
                        style={{ width: '100%' }}
                        placeholder="23:00"
                        allowClear={false}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <div style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  {t('btn.save')}
                </Button>
              </div>
            </Space>
          </Form>
        )}
      </div>
    </PageTransition>
  );
};

export default Settings;
