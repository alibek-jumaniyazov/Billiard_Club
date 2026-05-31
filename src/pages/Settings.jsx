import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Typography, Row, Col,
         Divider, TimePicker, Switch, Space } from 'antd';
import { SettingOutlined, SaveOutlined, ShopOutlined, ClockCircleOutlined,
         DollarOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { settingsApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const Settings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await settingsApi.get();
        const data = res.data.data;
        form.setFieldsValue({
          ...data,
          workingHoursStart: data.workingHoursStart ? dayjs(data.workingHoursStart, 'HH:mm') : null,
          workingHoursEnd: data.workingHoursEnd ? dayjs(data.workingHoursEnd, 'HH:mm') : null,
        });
      } catch {
        message.error('Sozlamalarni yuklashda xatolik');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (values) => {
    try {
      setSaving(true);
      const payload = {
        ...values,
        workingHoursStart: values.workingHoursStart ? values.workingHoursStart.format('HH:mm') : null,
        workingHoursEnd: values.workingHoursEnd ? values.workingHoursEnd.format('HH:mm') : null,
      };
      await settingsApi.update(payload);
      message.success('Sozlamalar saqlandi!');
    } catch {
      message.error('Saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const SectionCard = ({ title, icon, children }) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        title={<span>{icon} <span style={{ marginLeft: 8 }}>{title}</span></span>}
        bordered={false}
        style={{ borderRadius: 16, marginBottom: 16, borderTop: '3px solid var(--primary-color)' }}
      >
        {children}
      </Card>
    </motion.div>
  );

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
          <SettingOutlined style={{ marginRight: 8 }} />
          Tizim sozlamalari
        </Title>
        <Text type="secondary">Prime Billiard Club ma'lumotlari va ish sozlamalarini bu yerdan boshqaring</Text>
      </motion.div>

      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Row gutter={16}>
          <Col xs={24} lg={14}>
            <SectionCard title="Club ma'lumotlari" icon={<ShopOutlined style={{ color: '#faad14' }} />}>
              <Form.Item name="clubName" label="Club nomi" rules={[{ required: true }]}>
                <Input prefix={<ShopOutlined />} placeholder="Prime Billiard Club" size="large" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="phone" label="Telefon raqami">
                    <Input prefix={<PhoneOutlined />} placeholder="+998 90 123 45 67" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="currency" label="Valyuta">
                    <Input placeholder="UZS" size="large" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="address" label="Manzil">
                <Input.TextArea prefix={<EnvironmentOutlined />} placeholder="Toshkent sh., Yunusobod tumani..." rows={3} />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Narx sozlamalari" icon={<DollarOutlined style={{ color: '#52c41a' }} />}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="defaultTablePrice" label="Standart soatlik narx (so'm)">
                    <InputNumber style={{ width: '100%' }} min={0} step={1000} size="large" placeholder="40000" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="taxRate" label="Soliq stavkasi (%)">
                    <InputNumber style={{ width: '100%' }} min={0} max={100} size="large" placeholder="0" />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>
          </Col>

          <Col xs={24} lg={10}>
            <SectionCard title="Ish vaqti" icon={<ClockCircleOutlined style={{ color: '#1890ff' }} />}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="workingHoursStart" label="Ochilish vaqti">
                    <TimePicker format="HH:mm" style={{ width: '100%' }} size="large" placeholder="09:00" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="workingHoursEnd" label="Yopilish vaqti">
                    <TimePicker format="HH:mm" style={{ width: '100%' }} size="large" placeholder="23:00" />
                  </Form.Item>
                </Col>
              </Row>
            </SectionCard>

            <SectionCard title="Versiya ma'lumotlari" icon={<SettingOutlined style={{ color: '#722ed1' }} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Tizim', 'Prime Billiard POS'],
                  ['Versiya', 'v2.0.0 (Premium)'],
                  ['Backend', 'Node.js + Express'],
                  ['Ma\'lumotlar bazasi', 'PostgreSQL'],
                  ['Frontend', 'React + Ant Design'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Text type="secondary">{label}</Text>
                    <Text strong>{value}</Text>
                  </div>
                ))}
              </div>
            </SectionCard>
          </Col>
        </Row>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={saving}
            icon={<SaveOutlined />}
            style={{ minWidth: 200, height: 48 }}
          >
            Sozlamalarni saqlash
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default Settings;
