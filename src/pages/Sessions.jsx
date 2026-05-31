import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Button, Tag, Space, Modal, Form, Select, InputNumber, message, Popconfirm } from 'antd';
import { StopOutlined, EyeOutlined } from '@ant-design/icons';
import { sessionsApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [form] = Form.useForm();

  const fetchSessions = async (page = 1) => {
    try {
      setLoading(true);
      const res = await sessionsApi.getAll({ page, limit: pagination.pageSize });
      setSessions(res.data.data);
      setPagination({ ...pagination, current: page, total: res.data.pagination.total });
    } catch (error) {
      message.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleTableChange = (newPagination) => {
    fetchSessions(newPagination.current);
  };

  const openEndModal = (record) => {
    setSelectedSession(record);
    form.setFieldsValue({ paymentMethod: 'cash', discount: 0 });
    setIsEndModalOpen(true);
  };

  const handleEndSession = async (values) => {
    try {
      await sessionsApi.end(selectedSession.id, values);
      message.success("O'yin yakunlandi");
      setIsEndModalOpen(false);
      fetchSessions(pagination.current);
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Stol', dataIndex: ['table', 'name'], key: 'table' },
    { title: 'Mijoz', dataIndex: 'customerName', key: 'customerName', render: t => t || "Noma'lum" },
    { title: 'Boshlanish', dataIndex: 'startTime', key: 'startTime', render: v => dayjs(v).format('DD.MM.YYYY HH:mm') },
    { title: 'Tugash', dataIndex: 'endTime', key: 'endTime', render: v => v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: status => {
        const colors = { active: 'blue', completed: 'green', cancelled: 'red' };
        const labels = { active: 'Jarayonda', completed: 'Yakunlangan', cancelled: 'Bekor qilingan' };
        return <Tag color={colors[status]}>{labels[status]}</Tag>;
    }},
    { title: 'Jami summa', dataIndex: 'totalAmount', key: 'totalAmount', render: v => v ? `${parseFloat(v).toLocaleString()} so'm` : '-' },
    {
      title: 'Amallar',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          {record.status === 'active' && (
            <Button type="primary" danger icon={<StopOutlined />} size="small" onClick={() => openEndModal(record)}>
              Tugatish
            </Button>
          )}
          <Button type="dashed" icon={<EyeOutlined />} size="small">Ko'rish</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 d-flex justify-between align-center">
        <Title level={3} style={{ margin: 0 }}>O'yinlar tarixi va faol sessiyalar</Title>
      </div>

      <Card bordered={false} className="table-card" style={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          pagination={pagination}
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* End Session Modal */}
      <Modal
        title={`O'yinni yakunlash (Stol: ${selectedSession?.table?.number})`}
        open={isEndModalOpen}
        onCancel={() => setIsEndModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleEndSession}>
          <Form.Item name="paymentMethod" label="To'lov usuli" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="cash">Naqd pul</Select.Option>
              <Select.Option value="card">Plastik karta</Select.Option>
              <Select.Option value="transfer">Pul o'tkazmasi</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="discount" label="Chegirma (so'm)">
            <InputNumber style={{ width: '100%' }} min={0} step={1000} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" danger htmlType="submit" block size="large">
              O'yinni tugatish va hisoblash
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Sessions;
