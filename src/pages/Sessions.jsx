import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Button, Tag, Space, Modal, Form, Select, InputNumber,
         message, Input, Drawer, Descriptions, Divider, Badge, Row, Col, Statistic, Switch } from 'antd';
import { StopOutlined, EyeOutlined, SearchOutlined, ClockCircleOutlined,
         CoffeeOutlined, DollarOutlined, UserOutlined, FilterOutlined } from '@ant-design/icons';
import { sessionsApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const isDebt = Form.useWatch('isDebt', form);

  const fetchSessions = async (page = 1) => {
    try {
      setLoading(true);
      const params = { page, limit: pagination.pageSize };
      if (filterStatus) params.status = filterStatus;
      if (searchText) params.search = searchText;
      const res = await sessionsApi.getAll(params);
      setSessions(res.data.data);
      setPagination(prev => ({ ...prev, current: page, total: res.data.pagination.total }));
    } catch (error) {
      message.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, [filterStatus]);

  const openDrawer = (record) => {
    setSelectedSession(record);
    setIsDrawerOpen(true);
  };

  const openEndModal = (record) => {
    setSelectedSession(record);
    form.setFieldsValue({ 
      paymentMethod: 'cash', 
      discount: 0,
      isDebt: false,
      isTableDebt: true,
      isBarDebt: record.barAmount > 0,
      customerName: record.customerName || '',
      customerPhone: record.customerPhone || '',
    });
    setIsEndModalOpen(true);
  };

  const handleEndSession = async (values) => {
    try {
      const res = await sessionsApi.end(selectedSession.id, values);
      message.success(`O'yin yakunlandi! Jami: ${parseFloat(res.data.data.totalAmount).toLocaleString()} so'm`);
      setIsEndModalOpen(false);
      fetchSessions(pagination.current);
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const statusConfig = {
    active: { color: 'processing', label: 'Jarayonda', badge: 'processing' },
    completed: { color: 'success', label: 'Yakunlangan', badge: 'success' },
    cancelled: { color: 'error', label: 'Bekor qilingan', badge: 'error' },
  };

  const paymentLabels = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: v => <Text type="secondary">#{v}</Text>
    },
    {
      title: 'Stol',
      key: 'table',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status={r.status === 'active' ? 'processing' : 'default'} color={r.status === 'active' ? '#faad14' : undefined} />
          <Text strong>Stol {r.table?.number}</Text>
        </div>
      )
    },
    {
      title: 'Mijoz',
      dataIndex: 'customerName',
      render: (t, r) => (
        <div>
          <div>{t || <Text type="secondary">Anonim</Text>}</div>
          {r.customerPhone && <Text type="secondary" style={{ fontSize: 12 }}>{r.customerPhone}</Text>}
        </div>
      )
    },
    {
      title: 'Boshlanish',
      dataIndex: 'startTime',
      render: v => (
        <div>
          <div style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('HH:mm')}</Text>
        </div>
      )
    },
    {
      title: 'Davomiyligi',
      key: 'duration',
      render: (_, r) => {
        if (!r.durationMinutes) {
          if (r.status === 'active') {
            const mins = dayjs().diff(dayjs(r.startTime), 'minute');
            const h = Math.floor(mins / 60), m = mins % 60;
            return <Tag color="processing">{h}s {m}d (davom etmoqda)</Tag>;
          }
          return <Text type="secondary">-</Text>;
        }
        const h = Math.floor(r.durationMinutes / 60), m = r.durationMinutes % 60;
        return <Text>{h > 0 ? `${h} soat ` : ''}{m} daqiqa</Text>;
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: s => <Tag color={statusConfig[s]?.color}>{statusConfig[s]?.label}</Tag>
    },
    {
      title: 'Summa',
      key: 'amount',
      render: (_, r) => (
        <div>
          <div style={{ color: '#52c41a', fontWeight: 600 }}>
            {parseFloat(r.totalAmount || 0).toLocaleString()} so'm
          </div>
          {parseFloat(r.barAmount) > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <CoffeeOutlined /> Bar: {parseFloat(r.barAmount).toLocaleString()} so'm
            </Text>
          )}
        </div>
      )
    },
    {
      title: 'Amallar',
      key: 'actions',
      width: 140,
      render: (_, r) => (
        <Space>
          <Button type="text" icon={<EyeOutlined />} onClick={() => openDrawer(r)} style={{ color: '#faad14' }} />
          {r.status === 'active' && (
            <Button type="primary" danger icon={<StopOutlined />} size="small" onClick={() => openEndModal(r)}>
              Tugatish
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            O'yinlar tarixi
          </Title>
        </div>

        <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Input.Search
                placeholder="Mijoz ismi yoki telefon bo'yicha qidirish..."
                allowClear
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onSearch={() => fetchSessions(1)}
                prefix={<SearchOutlined />}
              />
            </Col>
            <Col>
              <Select
                value={filterStatus}
                onChange={v => setFilterStatus(v)}
                style={{ width: 160 }}
                placeholder="Status filtr"
                allowClear
              >
                <Select.Option value="active">Jarayonda</Select.Option>
                <Select.Option value="completed">Yakunlangan</Select.Option>
                <Select.Option value="cancelled">Bekor qilingan</Select.Option>
              </Select>
            </Col>
          </Row>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={sessions}
            rowKey="id"
            pagination={pagination}
            loading={loading}
            onChange={p => fetchSessions(p.current)}
            scroll={{ x: 900 }}
            rowClassName={r => r.status === 'active' ? 'active-row' : ''}
          />
        </Card>
      </motion.div>

      {/* Detail Drawer */}
      <Drawer
        title={
          <div>
            <Text strong style={{ fontSize: 16 }}>O'yin tafsilotlari #{selectedSession?.id}</Text>
            <br />
            <Tag color={statusConfig[selectedSession?.status]?.color} style={{ marginTop: 4 }}>
              {statusConfig[selectedSession?.status]?.label}
            </Tag>
          </div>
        }
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        width={420}
      >
        {selectedSession && (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={12}>
                <Statistic title="Stol summasi" value={`${parseFloat(selectedSession.tableAmount || 0).toLocaleString()} so'm`} valueStyle={{ color: '#faad14', fontSize: 16 }} />
              </Col>
              <Col span={12}>
                <Statistic title="Bar summasi" value={`${parseFloat(selectedSession.barAmount || 0).toLocaleString()} so'm`} valueStyle={{ color: '#1890ff', fontSize: 16 }} />
              </Col>
            </Row>
            <div style={{ background: 'rgba(250, 173, 20, 0.1)', border: '1px solid #faad1444', borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'center' }}>
              <Text type="secondary">Jami to'lov</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>
                {parseFloat(selectedSession.totalAmount || 0).toLocaleString()} so'm
              </div>
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Stol">Stol {selectedSession.table?.number} — {selectedSession.table?.name}</Descriptions.Item>
              <Descriptions.Item label="Mijoz">{selectedSession.customerName || 'Anonim'}</Descriptions.Item>
              {selectedSession.customerPhone && <Descriptions.Item label="Telefon">{selectedSession.customerPhone}</Descriptions.Item>}
              <Descriptions.Item label="Boshlandi">{dayjs(selectedSession.startTime).format('DD.MM.YYYY HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="Tugadi">
                {selectedSession.endTime ? dayjs(selectedSession.endTime).format('DD.MM.YYYY HH:mm:ss') : <Tag color="processing">Davom etmoqda</Tag>}
              </Descriptions.Item>
              {selectedSession.durationMinutes && (
                <Descriptions.Item label="Davomiyligi">
                  {Math.floor(selectedSession.durationMinutes / 60)}s {selectedSession.durationMinutes % 60}d
                </Descriptions.Item>
              )}
              {selectedSession.paymentMethod && (
                <Descriptions.Item label="To'lov usuli">
                  <Tag color="blue">{paymentLabels[selectedSession.paymentMethod]}</Tag>
                </Descriptions.Item>
              )}
              {parseFloat(selectedSession.discount) > 0 && (
                <Descriptions.Item label="Chegirma">
                  <Text style={{ color: '#f5222d' }}>-{parseFloat(selectedSession.discount).toLocaleString()} so'm</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedSession.status === 'active' && (
              <Button
                type="primary" danger block size="large"
                style={{ marginTop: 24 }}
                icon={<StopOutlined />}
                onClick={() => { setIsDrawerOpen(false); openEndModal(selectedSession); }}
              >
                O'yinni yakunlash
              </Button>
            )}
          </>
        )}
      </Drawer>

      {/* End Session Modal */}
      <Modal
        title={`O'yinni yakunlash — Stol ${selectedSession?.table?.number}`}
        open={isEndModalOpen}
        onCancel={() => setIsEndModalOpen(false)}
        footer={null}
        width={460}
      >
        {selectedSession && (
          <div style={{ background: '#0a1c14', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px dashed #faad14' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text type="secondary">Bar qarzi:</Text>
              <Text strong style={{ color: '#faad14' }}>{parseFloat(selectedSession.barAmount || 0).toLocaleString()} so'm</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">Boshlangan:</Text>
              <Text strong>{dayjs(selectedSession.startTime).format('HH:mm')}</Text>
            </div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleEndSession}>
          <Form.Item name="isDebt" valuePropName="checked" style={{ background: 'rgba(250, 173, 20, 0.1)', padding: 12, borderRadius: 8 }}>
            <Switch checkedChildren="Qarzga yozish" unCheckedChildren="To'liq to'lash" />
            <Text style={{ marginLeft: 12, fontWeight: 500 }}>Ushbu chek qarzga yoziladimi?</Text>
          </Form.Item>

          {isDebt && (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="customerName" label="Mijoz ismi (Majburiy)" rules={[{ required: true, message: 'Ism kiriting' }]}>
                    <Input placeholder="Ismni kiriting" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="customerPhone" label="Telefon raqami (Ixtiyoriy)">
                    <Input placeholder="+998..." />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="isTableDebt" valuePropName="checked" style={{ margin: 0 }}>
                    <Switch checkedChildren="Stol qarzga" unCheckedChildren="Stol to'lanadi" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="isBarDebt" valuePropName="checked" style={{ margin: 0 }}>
                    <Switch checkedChildren="Bar qarzga" unCheckedChildren="Bar to'lanadi" />
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                Qarzga qaysi qismlar yozilishini belgilang. Tizim aniq summani avtomatik hisoblab qarzga yozadi.
              </Text>
            </div>
          )}

          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="paymentMethod" label="To'lov usuli" rules={[{ required: true }]}>
                <Select size="large" disabled={isDebt}>
                  <Select.Option value="cash">💵 Naqd pul</Select.Option>
                  <Select.Option value="card">💳 Plastik karta</Select.Option>
                  <Select.Option value="transfer">📱 Pul o'tkazmasi</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="discount" label="Chegirma (so'm)">
                <InputNumber style={{ width: '100%' }} min={0} step={1000} size="large" disabled={isDebt} />
              </Form.Item>
            </Col>
          </Row>
          <Button type={isDebt ? "default" : "primary"} danger={!isDebt} htmlType="submit" block size="large" icon={<DollarOutlined />}>
            {isDebt ? "Qarzga yozish va Yakunlash" : "Yakunlash va Chek chiqarish"}
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Sessions;
