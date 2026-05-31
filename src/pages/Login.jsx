import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    const success = await login(values);
    if (success) {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <Card className="auth-card" bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Title level={2} style={{ margin: 0, color: 'var(--primary-color)' }}>Prime Billiard</Title>
          <Text type="secondary">Tizimga kirish uchun ma'lumotlarni kiriting</Text>
        </div>

        <Form
          name="login_form"
          layout="vertical"
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Username kiriting!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Parol kiriting!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Parol" />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px' }}>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: '48px', fontSize: '16px', fontWeight: 600 }}>
              Kirish
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
