import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Typography, Space, Tag } from 'antd';
import { 
  DollarOutlined, 
  TableOutlined, 
  UserOutlined, 
  RiseOutlined 
} from '@ant-design/icons';
import { dashboardApi } from '../api';
import dayjs from 'dayjs';

const { Title } = Typography;

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await dashboardApi.getStats();
      setStats(res.data.data);
    } catch (error) {
      console.error("Dashboard yuklanishida xatolik", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', minimumFractionDigits: 0 }).format(amount);
  };

  const statCards = [
    { title: "Bugungi tushum", value: formatMoney(stats?.dailyRevenue || 0), icon: <DollarOutlined />, color: "var(--success-color)" },
    { title: "Oylik tushum", value: formatMoney(stats?.monthlyRevenue || 0), icon: <RiseOutlined />, color: "var(--primary-color)" },
    { title: "Aktiv stollar", value: `${stats?.busyTables || 0} / ${stats?.totalTables || 0}`, icon: <TableOutlined />, color: "var(--warning-color)" },
    { title: "Jami mijozlar", value: stats?.totalCustomers || 0, icon: <UserOutlined />, color: "#722ed1" },
  ];

  const columns = [
    { title: 'Stol', dataIndex: ['table', 'name'], key: 'table' },
    { title: 'Mijoz', dataIndex: 'customerName', key: 'customer', render: (text) => text || "Noma'lum" },
    { title: 'Boshlanish vaqti', dataIndex: 'startTime', key: 'startTime', render: (val) => dayjs(val).format('HH:mm') },
    { title: 'Status', dataIndex: 'status', key: 'status', render: () => <Tag color="green">Aktiv</Tag> },
  ];

  const recentColumns = [
    { title: 'Stol', dataIndex: ['table', 'name'], key: 'table' },
    { title: 'Vaqt', dataIndex: 'endTime', key: 'endTime', render: (val) => dayjs(val).format('HH:mm') },
    { title: 'Summa', dataIndex: 'totalAmount', key: 'totalAmount', render: (val) => formatMoney(val) },
  ];

  return (
    <div>
      <div className="mb-3 d-flex justify-between align-center">
        <Title level={3} style={{ margin: 0 }}>Dashboard</Title>
      </div>
      
      <Row gutter={[16, 16]} className="mb-3">
        {statCards.map((stat, i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card className="hover-scale" bordered={false} loading={loading}>
              <Statistic
                title={stat.title}
                value={stat.value}
                valueStyle={{ color: stat.color, fontWeight: 600 }}
                prefix={<span style={{ marginRight: '8px' }}>{stat.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Hozirgi aktiv o'yinlar" bordered={false} className="h-100">
            <Table 
              dataSource={stats?.activeSessionsData || []} 
              columns={columns} 
              rowKey="id" 
              pagination={false}
              loading={loading}
              size="middle"
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="So'nggi yakunlanganlar" bordered={false} className="h-100">
            <Table 
              dataSource={stats?.recentSessions || []} 
              columns={recentColumns} 
              rowKey="id" 
              pagination={false}
              loading={loading}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
