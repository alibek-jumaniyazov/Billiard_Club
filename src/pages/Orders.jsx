import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Tag, Space, Row, Col, Statistic, Input, Select, message, Button } from 'antd';
import { CoffeeOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { ordersApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');

  const fetchOrders = async (page = 1) => {
    try {
      setLoading(true);
      const res = await ordersApi.getAll({ page, limit: pagination.pageSize });
      setOrders(res.data.data || []);
      setPagination(prev => ({ ...prev, current: page, total: res.data.pagination?.total || 0 }));
    } catch {
      message.error("Buyurtmalarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      width: 60,
      render: v => <Text type="secondary">#{v}</Text>
    },
    {
      title: 'Stol',
      render: (_, r) => <Text strong>Stol {r.table?.number || '-'}</Text>
    },
    {
      title: 'Buyurtmachi',
      render: (_, r) => r.session?.customerName || <Text type="secondary">Anonim</Text>
    },
    {
      title: 'Mahsulotlar',
      render: (_, r) => (
        <Space wrap>
          {r.items?.map((item, i) => (
            <Tag key={i} color="blue">
              {item.product?.name} x{item.quantity}
            </Tag>
          )) || <Text type="secondary">-</Text>}
        </Space>
      )
    },
    {
      title: 'Sana',
      dataIndex: 'createdAt',
      render: v => (
        <div>
          <div style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('HH:mm')}</Text>
        </div>
      )
    },
    {
      title: 'Jami summa',
      dataIndex: 'totalAmount',
      render: v => <Text strong style={{ color: '#52c41a' }}>{parseFloat(v || 0).toLocaleString()} so'm</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: s => {
        const map = { open: ['processing', 'Ochiq'], closed: ['success', 'Yopilgan'], cancelled: ['error', 'Bekor'] };
        return <Tag color={map[s]?.[0]}>{map[s]?.[1]}</Tag>;
      }
    },
  ];

  const todayTotal = orders.filter(o => dayjs(o.createdAt).isSame(dayjs(), 'day')).reduce((a, b) => a + parseFloat(b.totalAmount || 0), 0);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <ShoppingCartOutlined style={{ marginRight: 8 }} />
            Bar Buyurtmalari
          </Title>
        </div>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #faad14' }}>
              <Statistic title="Bugungi bar savdo" value={`${todayTotal.toLocaleString()} so'm`} valueStyle={{ color: '#faad14', fontSize: 18 }} prefix={<CoffeeOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #52c41a' }}>
              <Statistic title="Bugungi buyurtmalar" value={orders.filter(o => dayjs(o.createdAt).isSame(dayjs(), 'day')).length} suffix="ta" valueStyle={{ color: '#52c41a', fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #1890ff' }}>
              <Statistic title="Jami buyurtmalar" value={pagination.total} suffix="ta" valueStyle={{ color: '#1890ff', fontSize: 18 }} />
            </Card>
          </Col>
        </Row>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={orders}
            rowKey="id"
            pagination={pagination}
            loading={loading}
            onChange={p => fetchOrders(p.current)}
            scroll={{ x: 800 }}
            locale={{ emptyText: 'Hali buyurtmalar yo\'q' }}
          />
        </Card>
      </motion.div>
    </div>
  );
};

export default Orders;
