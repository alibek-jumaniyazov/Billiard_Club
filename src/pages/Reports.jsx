import React, { useState, useEffect } from 'react';
import { Typography, Card, Row, Col, Statistic, DatePicker, Segmented, Table, Tag, Space, Button, message } from 'antd';
import { BarChartOutlined, DollarOutlined, CoffeeOutlined, DesktopOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import { reportsApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('daily');
  const [customRange, setCustomRange] = useState([]);
  const [data, setData] = useState({
    sessions: [],
    summary: { totalRevenue: 0, tableRevenue: 0, barRevenue: 0, totalSessions: 0, avgSessionDuration: 0 }
  });

  const fetchReports = async () => {
    try {
      setLoading(true);
      const params = {};
      if (reportType === 'custom' && customRange.length === 2) {
        params.from = customRange[0].toISOString();
        params.to = customRange[1].toISOString();
      }
      const res = await reportsApi.getReport(reportType, params);
      setData(res.data.data);
    } catch (error) {
      message.error("Hisobotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportType !== 'custom' || customRange.length === 2) {
      fetchReports();
    }
  }, [reportType, customRange]);

  const columns = [
    { title: 'Stol', key: 'table', render: (_, r) => <Text strong>Stol {r.table?.number}</Text> },
    { title: 'Boshlandi', dataIndex: 'startTime', render: v => dayjs(v).format('DD.MM.YY HH:mm') },
    { title: 'Tugadi', dataIndex: 'endTime', render: v => dayjs(v).format('DD.MM.YY HH:mm') },
    { title: 'Vaqt (daqiqa)', dataIndex: 'durationMinutes', render: v => <Tag color="blue">{v} daq</Tag> },
    { title: 'Stol summasi', dataIndex: 'tableAmount', render: v => <Text style={{ color: '#faad14' }}>{parseFloat(v || 0).toLocaleString()} so'm</Text> },
    { title: 'Bar summasi', dataIndex: 'barAmount', render: v => <Text style={{ color: '#1890ff' }}>{parseFloat(v || 0).toLocaleString()} so'm</Text> },
    { title: 'Jami', dataIndex: 'totalAmount', render: v => <Text strong style={{ color: '#52c41a' }}>{parseFloat(v || 0).toLocaleString()} so'm</Text> },
  ];

  const statCardStyle = { 
    borderRadius: 16, 
    background: 'rgba(255, 255, 255, 0.05)', 
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)'
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <BarChartOutlined style={{ marginRight: 8 }} />
            Moliyaviy Hisobotlar
          </Title>
          <Text type="secondary">Tizimning to'liq analitikasi va tushumlar hisoboti</Text>
        </Col>
        <Col>
          <Space>
            <Segmented
              options={[
                { label: 'Bugun', value: 'daily' },
                { label: 'Shu hafta', value: 'weekly' },
                { label: 'Shu oy', value: 'monthly' },
                { label: 'Davrni tanlash', value: 'custom' },
              ]}
              value={reportType}
              onChange={setReportType}
              size="large"
            />
            {reportType === 'custom' && (
              <RangePicker onChange={setCustomRange} size="large" style={{ background: 'rgba(0,0,0,0.2)' }} />
            )}
            <Button type="primary" icon={<SyncOutlined spin={loading} />} onClick={fetchReports} size="large" />
          </Space>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card bordered={false} style={{ ...statCardStyle, borderBottom: '4px solid #52c41a' }}>
              <Statistic title="Jami Tushum" value={data.summary.totalRevenue} prefix={<DollarOutlined />} suffix="so'm" valueStyle={{ color: '#52c41a', fontWeight: 600 }} />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card bordered={false} style={{ ...statCardStyle, borderBottom: '4px solid #faad14' }}>
              <Statistic title="Stollar tushumi" value={data.summary.tableRevenue} prefix={<DesktopOutlined />} suffix="so'm" valueStyle={{ color: '#faad14', fontWeight: 600 }} />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card bordered={false} style={{ ...statCardStyle, borderBottom: '4px solid #1890ff' }}>
              <Statistic title="Bar tushumi" value={data.summary.barRevenue} prefix={<CoffeeOutlined />} suffix="so'm" valueStyle={{ color: '#1890ff', fontWeight: 600 }} />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card bordered={false} style={{ ...statCardStyle, borderBottom: '4px solid #fff' }}>
              <Statistic title="O'ynalgan sessiyalar" value={data.summary.totalSessions} prefix={<BarChartOutlined />} valueStyle={{ fontWeight: 600 }} />
            </Card>
          </motion.div>
        </Col>
      </Row>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table 
            columns={columns} 
            dataSource={data.sessions} 
            rowKey="id" 
            loading={loading}
            pagination={{ pageSize: 15 }}
            scroll={{ x: 800 }}
          />
        </Card>
      </motion.div>
    </div>
  );
};

export default Reports;
