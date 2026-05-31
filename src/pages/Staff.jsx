import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Button, Tag, Space, Modal, Form, Input, Select,
         message, Popconfirm, Avatar, Row, Col, Statistic, Badge, Switch } from 'antd';
import { PlusOutlined, EditOutlined, UserOutlined, TeamOutlined, CrownOutlined,
         LockOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { staffApi } from '../api';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const roleConfig = {
  admin: { color: 'gold', label: 'Admin', icon: <CrownOutlined /> },
  kassir: { color: 'blue', label: 'Kassir', icon: <UserOutlined /> },
  operator: { color: 'default', label: 'Operator', icon: <UserOutlined /> },
};

const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [form] = Form.useForm();
  const { user } = useAuth();

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await staffApi.getAll();
      setStaff(res.data.data);
    } catch {
      message.error("Xodimlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleSave = async (values) => {
    try {
      if (editingStaff) {
        // Don't send empty password
        if (!values.password) delete values.password;
        await staffApi.update(editingStaff.id, values);
        message.success('Xodim yangilandi');
      } else {
        await staffApi.create(values);
        message.success("Xodim qo'shildi");
      }
      setIsModalOpen(false);
      fetchStaff();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await staffApi.delete(id);
      message.success("Xodim o'chirildi");
      fetchStaff();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const openModal = (record = null) => {
    setEditingStaff(record);
    if (record) {
      form.setFieldsValue({ ...record, password: '' });
    } else {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const adminCount = staff.filter(s => s.role === 'admin').length;
  const kassirCount = staff.filter(s => s.role === 'kassir').length;
  const activeCount = staff.filter(s => s.isActive).length;

  const columns = [
    {
      title: 'Xodim',
      key: 'name',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            style={{
              background: r.role === 'admin' ? '#faad14' : r.role === 'kassir' ? '#1890ff' : '#8c8c8c',
              fontWeight: 700
            }}
          >
            {r.name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>
              {r.name}
              {r.id === user?.id && <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>Siz</Tag>}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>@{r.username}</Text>
          </div>
        </div>
      )
    },
    {
      title: 'Lavozim',
      dataIndex: 'role',
      render: role => (
        <Tag color={roleConfig[role]?.color} icon={roleConfig[role]?.icon}>
          {roleConfig[role]?.label}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      render: active => (
        <Badge
          status={active ? 'success' : 'error'}
          text={active ? 'Faol' : 'Nofaol'}
        />
      )
    },
    {
      title: 'Qo\'shilgan',
      dataIndex: 'createdAt',
      render: v => dayjs(v).format('DD.MM.YYYY')
    },
    {
      title: 'Amallar',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} style={{ color: '#faad14' }} onClick={() => openModal(r)} />
          {r.id !== user?.id && (
            <Popconfirm
              title="Xodimni o'chirmoqchimisiz?"
              description="Bu xodim tizimga kira olmaydi"
              onConfirm={() => handleDeactivate(r.id)}
              okText="Ha" cancelText="Yo'q" okType="danger"
            >
              <Button type="text" danger icon={<UserDeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>
            <TeamOutlined style={{ marginRight: 8 }} />
            Xodimlar boshqaruvi
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Yangi xodim
          </Button>
        </div>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #faad14' }}>
              <Statistic title="Jami xodimlar" value={staff.length} suffix="ta" valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #52c41a' }}>
              <Statistic title="Faol xodimlar" value={activeCount} suffix="ta" valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bordered={false} style={{ borderRadius: 12, borderLeft: '4px solid #1890ff' }}>
              <Statistic title="Adminlar" value={adminCount} suffix="ta" valueStyle={{ color: '#1890ff' }} />
            </Card>
          </Col>
        </Row>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card bordered={false} style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={staff}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </motion.div>

      <Modal
        title={editingStaff ? "Xodimni tahrirlash" : "Yangi xodim qo'shish"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="To'liq ismi" rules={[{ required: true, message: 'Ismni kiriting' }]}>
            <Input prefix={<UserOutlined />} placeholder="Alibek Jumaniyazov" size="large" />
          </Form.Item>
          <Form.Item name="username" label="Tizim login (username)" rules={[{ required: !editingStaff, message: 'Username kiriting' }]}>
            <Input prefix={<span style={{ opacity: 0.5 }}>@</span>} placeholder="alibek_2024" size="large" disabled={!!editingStaff} />
          </Form.Item>
          <Form.Item name="role" label="Lavozim" rules={[{ required: true }]}>
            <Select size="large">
              <Select.Option value="admin">👑 Admin — Barcha huquqlar</Select.Option>
              <Select.Option value="kassir">💼 Kassir — Sotuv va hisobot</Select.Option>
              <Select.Option value="operator">👤 Operator — Faqat o'yin boshlash</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="password"
            label={editingStaff ? "Yangi parol (o'zgartirish uchun)" : "Parol"}
            rules={[{ required: !editingStaff, message: 'Parol kiriting' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={editingStaff ? "Bo'sh qoldirsa o'zgarmaydi" : "Kamida 6 belgi"} size="large" />
          </Form.Item>
          {editingStaff && (
            <Form.Item name="isActive" label="Status" valuePropName="checked">
              <Switch checkedChildren="Faol" unCheckedChildren="Nofaol" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block size="large">
            {editingStaff ? 'Saqlash' : "Xodim qo'shish"}
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Staff;
