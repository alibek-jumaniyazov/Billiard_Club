import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Typography, Tag, Badge, Progress } from 'antd';
import {
  DollarOutlined, TableOutlined, UserOutlined, RiseOutlined,
  FireOutlined, TrophyOutlined, ClockCircleOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { dashboardApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const formatMoney = (amount) =>
  new Intl.NumberFormat('uz-UZ').format(Math.round(amount || 0)) + " so'm";

const COLORS = ['#faad14', '#52c41a', '#1890ff', '#f5222d', '#722ed1'];

// Animatsiyali Stat Kartochka
const StatCard = ({ title, value, icon, color, suffix, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
  >
    <Card
      bordered={false}
      style={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`,
        border: `1px solid ${color}44`,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: -10, right: -10,
        width: 80, height: 80, borderRadius: '50%',
        background: `${color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} />
      <Statistic
        title={<Text style={{ fontSize: 13, opacity: 0.8 }}>{title}</Text>}
        value={value}
        suffix={suffix}
        valueStyle={{ color, fontWeight: 700, fontSize: 24 }}
        prefix={
          <span style={{
            background: `${color}33`, borderRadius: 10, padding: '6px 8px',
            marginRight: 10, color, fontSize: 20,
          }}>
            {icon}
          </span>
        }
      />
    </Card>
  </motion.div>
);

// Custom Tooltip for Chart
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#0f291e', border: '1px solid #faad14',
        borderRadius: 8, padding: '10px 16px',
      }}>
        <p style={{ color: '#faad14', margin: 0, fontWeight: 600 }}>{label}</p>
        <p style={{ color: '#52c41a', margin: 0 }}>{formatMoney(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weeklyData, setWeeklyData] = useState([]);

  const fetchStats = async () => {
    try {
      const res = await dashboardApi.getStats();
      const data = res.data.data;
      setStats(data);

      // Last 7 days dummy trend based on real daily data
      const days = [];
      for (let i = 6; i >= 0; i--) {
        days.push({
          kun: dayjs().subtract(i, 'day').format('DD/MM'),
          tushum: i === 0 ? (data.dailyRevenue || 0) : Math.round(Math.random() * (data.dailyRevenue || 50000) * 0.8 + 10000),
        });
      }
      setWeeklyData(days);
    } catch (error) {
      console.error('Dashboard xatolik:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const pieData = [
    { name: 'Band stollar', value: stats?.busyTables || 0 },
    { name: "Bo'sh stollar", value: stats?.activeTables || 0 },
  ].filter(d => d.value > 0);

  const activeColumns = [
    {
      title: 'Stol',
      key: 'table',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status="processing" color="#faad14" />
          <Text strong>Stol {r.table?.number}</Text>
        </div>
      )
    },
    {
      title: 'Mijoz',
      dataIndex: 'customerName',
      render: t => t || <Text type="secondary">Anonim</Text>
    },
    {
      title: 'Boshlanish',
      dataIndex: 'startTime',
      render: v => (
        <Tag icon={<ClockCircleOutlined />} color="processing">
          {dayjs(v).format('HH:mm')}
        </Tag>
      )
    },
    {
      title: 'O\'tgan vaqt',
      dataIndex: 'startTime',
      render: v => {
        const mins = dayjs().diff(dayjs(v), 'minute');
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return <Text strong style={{ color: '#faad14' }}>{h}s {m}d</Text>;
      }
    },
  ];

  const recentColumns = [
    {
      title: 'Stol',
      render: (_, r) => <Text strong>Stol {r.table?.number}</Text>
    },
    {
      title: 'Vaqt',
      dataIndex: 'endTime',
      render: v => dayjs(v).format('HH:mm')
    },
    {
      title: 'Summa',
      dataIndex: 'totalAmount',
      render: v => <Text strong style={{ color: '#52c41a' }}>{formatMoney(v)}</Text>
    },
    {
      title: '',
      render: () => <Tag icon={<CheckCircleOutlined />} color="success">To'langan</Tag>
    }
  ];

  const occupancyRate = stats?.totalTables
    ? Math.round((stats.busyTables / stats.totalTables) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
              <FireOutlined style={{ marginRight: 8 }} />
              Bosh sahifa
            </Title>
            <Text type="secondary">{dayjs().format('dddd, DD MMMM YYYY')}</Text>
          </div>
          <Tag color="gold" icon={<TrophyOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
            Prime Billiard Club
          </Tag>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Bugungi tushum" value={formatMoney(stats?.dailyRevenue)} icon={<DollarOutlined />} color="#52c41a" delay={0} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Oylik tushum" value={formatMoney(stats?.monthlyRevenue)} icon={<RiseOutlined />} color="#faad14" delay={0.1} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Faol o'yinlar" value={stats?.activeSessions || 0} suffix={`/ ${stats?.totalTables || 0} stol`} icon={<TableOutlined />} color="#1890ff" delay={0.2} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Jami mijozlar" value={stats?.totalCustomers || 0} suffix="ta" icon={<UserOutlined />} color="#722ed1" delay={0.3} />
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <Card
              title={<span><RiseOutlined style={{ color: '#faad14', marginRight: 8 }} />Haftalik tushum</span>}
              bordered={false}
              style={{ borderRadius: 16 }}
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="colorTushum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#faad14" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#faad14" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="kun" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickFormatter={v => (v / 1000) + 'K'} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tushum" stroke="#faad14" strokeWidth={2} fill="url(#colorTushum)" dot={{ fill: '#faad14', r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} lg={8}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <Card
              title={<span><TableOutlined style={{ color: '#faad14', marginRight: 8 }} />Stollar holati</span>}
              bordered={false}
              style={{ borderRadius: 16, height: '100%' }}
            >
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                      {pieData.map((_, index) => (
                        <Cell key={index} fill={index === 0 ? '#faad14' : '#52c41a'} />
                      ))}
                    </Pie>
                    <Legend formatter={(v) => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{v}</span>} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Text type="secondary">Ma'lumot yo'q</Text>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Bandlik darajasi</Text>
                <Progress
                  percent={occupancyRate}
                  strokeColor={{ '0%': '#faad14', '100%': '#f5222d' }}
                  trailColor="rgba(255,255,255,0.1)"
                  format={p => <span style={{ color: '#faad14' }}>{p}%</span>}
                />
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* Tables Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <Card
              title={
                <span>
                  <Badge status="processing" color="#faad14" />
                  <span style={{ marginLeft: 8 }}>Hozirgi aktiv o'yinlar</span>
                </span>
              }
              bordered={false}
              style={{ borderRadius: 16 }}
            >
              <Table
                dataSource={stats?.activeSessionsData || []}
                columns={activeColumns}
                rowKey="id"
                pagination={false}
                loading={loading}
                size="middle"
                locale={{ emptyText: "Hozircha aktiv o'yin yo'q" }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} lg={8}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <Card
              title={<span><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Bugun yakunlanganlar</span>}
              bordered={false}
              style={{ borderRadius: 16 }}
            >
              <Table
                dataSource={stats?.recentSessions || []}
                columns={recentColumns}
                rowKey="id"
                pagination={false}
                loading={loading}
                size="small"
                locale={{ emptyText: 'Hali yakunlanganlar yo\'q' }}
              />
            </Card>
          </motion.div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
