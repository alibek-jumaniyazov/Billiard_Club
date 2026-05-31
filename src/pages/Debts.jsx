import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Button, Tag, Space, Modal, Form, InputNumber,
         message, Input, Row, Col, Statistic, Badge } from 'antd';
import { SearchOutlined, DollarOutlined, BookOutlined } from '@ant-design/icons';
import { debtsApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const Debts = () => {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [form] = Form.useForm();

  const fetchDebts = async (page = 1) => {
    try {
      setLoading(true);
      const params = { page, limit: pagination.pageSize };
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

  useEffect(() => { fetchDebts(); }, []);

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

  const handleDelete = async (id) => {
    try {
      await debtsApi.delete(id);
      message.success("Qarz o'chirildi");
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
      render: v => dayjs(v).format('DD.MM.YYYY HH:mm')
    },
    {
      title: 'Stol qarzi',
      dataIndex: 'tableAmount',
      render: v => `${parseFloat(v).toLocaleString()} so'm`
    },
    {
      title: 'Bar qarzi',
      dataIndex: 'barAmount',
      render: v => `${parseFloat(v).toLocaleString()} so'm`
    },
    {
      title: 'Jami Qarz',
      dataIndex: 'totalDebt',
      render: v => <Text strong style={{ color: '#f5222d' }}>{parseFloat(v).toLocaleString()} so'm</Text>
    },
    {
      title: 'Qolgan Qarz',
      dataIndex: 'remainingDebt',
      render: v => <Text strong style={{ color: '#faad14' }}>{parseFloat(v).toLocaleString()} so'm</Text>
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
            <Button type="primary" size="small" onClick={() => openPayModal(r)}>
              To'lash
            </Button>
          )}
        </Space>
      )
    }
  ];

  const totalUnpaid = debts.filter(d => !d.isPaid).reduce((sum, d) => sum + parseFloat(d.remainingDebt), 0);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <BookOutlined style={{ marginRight: 8 }} />
            Qarzlar daftari
          </Title>
        </div>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #f5222d' }}>
              <Statistic title="Jami tolanmagan qarzlar" value={`${totalUnpaid.toLocaleString()} so'm`} valueStyle={{ color: '#f5222d', fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={24} sm={16}>
             <Card bordered={false} style={{ borderRadius: 12 }}>
                <Input.Search
                  placeholder="Mijoz ismi yoki telefoni orqali qidirish..."
                  allowClear
                  enterButton="Qidirish"
                  size="large"
                  onSearch={(value) => {
                    setSearchText(value);
                    fetchDebts(1);
                  }}
                />
             </Card>
          </Col>
        </Row>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={debts}
            rowKey="id"
            pagination={pagination}
            loading={loading}
            onChange={p => fetchDebts(p.current)}
            scroll={{ x: 800 }}
            rowClassName={r => !r.isPaid ? 'unpaid-row' : 'paid-row'}
          />
        </Card>
      </motion.div>

      <Modal
        title={`Qarzni to'lash: ${selectedDebt?.customerName}`}
        open={isPayModalOpen}
        onCancel={() => setIsPayModalOpen(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(250, 173, 20, 0.1)', borderRadius: 8 }}>
          <Text type="secondary">Jami qolgan qarz:</Text>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
            {parseFloat(selectedDebt?.remainingDebt || 0).toLocaleString()} so'm
          </div>
        </div>
        <Form form={form} layout="vertical" onFinish={handlePay}>
          <Form.Item name="amount" label="To'lanayotgan summa (so'm)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" icon={<DollarOutlined />}>
            To'lovni tasdiqlash
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Debts;
