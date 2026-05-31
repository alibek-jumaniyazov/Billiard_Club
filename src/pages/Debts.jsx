import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Button, Tag, Space, Modal, Form, InputNumber,
         message, Input, Row, Col, Statistic, Segmented } from 'antd';
import { SearchOutlined, DollarOutlined, BookOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { debtsApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const Debts = () => {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid');
  
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [form] = Form.useForm();

  const fetchDebts = async (page = 1) => {
    try {
      setLoading(true);
      const params = { page, limit: pagination.pageSize, status: statusFilter };
      if (searchText) params.search = searchText;
      const res = await debtsApi.getAll(params);
      setDebts(res.data.data);
      setPagination(prev => ({ ...prev, current: page, total: res.data.pagination.total }));
    } catch (error) {
      message.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDebts(); }, [statusFilter]);

  const openPayModal = (record) => {
    setSelectedDebt(record);
    form.setFieldsValue({ amount: parseFloat(record.remainingDebt) });
    setIsPayModalOpen(true);
  };

  const handlePay = async (values) => {
    try {
      await debtsApi.pay(selectedDebt.id, values.amount);
      message.success("To'lov qabul qilindi");
      setIsPayModalOpen(false);
      fetchDebts(pagination.current);
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const columns = [
    {
      title: 'Mijoz',
      key: 'customer',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.customerName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.customerPhone || 'Telefon yo\'q'}</Text>
        </div>
      )
    },
    {
      title: 'O\'yin vaqti',
      dataIndex: 'createdAt',
      render: v => dayjs(v).format('DD.MM.YY HH:mm')
    },
    {
      title: 'Stol / Bar qarzi',
      key: 'details',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>Stol: {parseFloat(r.tableAmount).toLocaleString()} so'm</div>
          <div>Bar: {parseFloat(r.barAmount).toLocaleString()} so'm</div>
        </div>
      )
    },
    {
      title: 'Jami / To\'langan',
      key: 'amounts',
      render: (_, r) => (
        <div style={{ fontSize: 13 }}>
          <div style={{ color: '#f5222d', fontWeight: 500 }}>Jami: {parseFloat(r.totalDebt).toLocaleString()}</div>
          <div style={{ color: '#52c41a' }}>To'landi: {parseFloat(r.paidAmount).toLocaleString()}</div>
        </div>
      )
    },
    {
      title: 'Qolgan Qarz',
      dataIndex: 'remainingDebt',
      render: v => <Text strong style={{ color: '#faad14', fontSize: 15 }}>{parseFloat(v).toLocaleString()} so'm</Text>
    },
    {
      title: 'Status',
      dataIndex: 'isPaid',
      render: v => v ? <Tag color="success">To'langan</Tag> : <Tag color="error">To'lanmagan</Tag>
    },
    {
      title: 'Amallar',
      key: 'actions',
      render: (_, r) => (
        <Space>
          {!r.isPaid && (
            <Button type="primary" onClick={() => openPayModal(r)} style={{ background: '#faad14', borderColor: '#faad14' }}>
              Qarzni uzish
            </Button>
          )}
        </Space>
      )
    }
  ];

  const totalUnpaid = debts.reduce((sum, d) => sum + parseFloat(d.remainingDebt), 0);

  return (
    <div>
      <Row justify="space-between" align="middle" className="mb-3">
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <BookOutlined style={{ marginRight: 8 }} />
            Qarzlar daftari
          </Title>
        </Col>
        <Col>
          <Segmented
            options={[
              { label: 'To\'lanmagan', value: 'unpaid' },
              { label: 'To\'langan', value: 'paid' },
              { label: 'Barchasi', value: 'all' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            size="large"
          />
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #faad14', background: 'var(--bg-card-dark)' }}>
            <Statistic 
              title="Ushbu ro'yxatdagi qarzlar summasi" 
              value={totalUnpaid} 
              suffix="so'm" 
              valueStyle={{ color: '#faad14', fontWeight: 600 }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={16}>
           <Card bordered={false} style={{ borderRadius: 12, background: 'var(--bg-card-dark)', height: '100%', display: 'flex', alignItems: 'center' }}>
              <Input.Search
                placeholder="Mijoz ismi yoki telefoni orqali qidirish..."
                allowClear
                enterButton="Qidirish"
                size="large"
                onSearch={(value) => {
                  setSearchText(value);
                  fetchDebts(1);
                }}
                style={{ width: '100%' }}
              />
           </Card>
        </Col>
      </Row>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={debts}
            rowKey="id"
            pagination={pagination}
            loading={loading}
            onChange={p => fetchDebts(p.current)}
            scroll={{ x: 900 }}
            rowClassName={r => !r.isPaid ? 'unpaid-row' : 'paid-row'}
          />
        </Card>
      </motion.div>

      <Modal
        title={
          <Space>
            <DollarOutlined style={{ color: '#faad14' }} />
            <span>Qarzni uzish: {selectedDebt?.customerName}</span>
          </Space>
        }
        open={isPayModalOpen}
        onCancel={() => setIsPayModalOpen(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16, padding: 16, background: 'rgba(250, 173, 20, 0.1)', borderRadius: 12, border: '1px solid rgba(250, 173, 20, 0.3)' }}>
          <Text type="secondary">Qolgan qarz:</Text>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#faad14' }}>
            {parseFloat(selectedDebt?.remainingDebt || 0).toLocaleString()} so'm
          </div>
        </div>
        
        <Form form={form} layout="vertical" onFinish={handlePay}>
          <Form.Item name="amount" label="To'lanayotgan summa (so'm)" rules={[{ required: true, type: 'number', min: 1, max: parseFloat(selectedDebt?.remainingDebt || 0) }]}>
            <InputNumber 
              style={{ width: '100%' }} 
              size="large" 
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
             <Button 
                onClick={() => form.setFieldsValue({ amount: parseFloat(selectedDebt?.remainingDebt) })}
                type="dashed"
                style={{ flex: 1, color: '#52c41a', borderColor: '#52c41a' }}
             >
                To'liq to'lash
             </Button>
          </div>

          <Button type="primary" htmlType="submit" block size="large" icon={<CheckCircleOutlined />}>
            To'lovni qabul qilish
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Debts;
