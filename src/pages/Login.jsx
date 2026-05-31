import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Card } from 'antd';
import { UserOutlined, LockOutlined, TrophyOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const { Text } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      await login(values);
    } catch (error) {
      message.error(error.response?.data?.message || "Login yoki parol noto'g'ri!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1c14 0%, #0f291e 50%, #071510 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative background balls */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -20, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.5 }}
          style={{
            position: 'absolute',
            width: [200, 150, 100, 80, 120, 60][i],
            height: [200, 150, 100, 80, 120, 60][i],
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(250,173,20,0.${[1,2,1,2,1,2][i]}) 0%, transparent 70%)`,
            left: ['10%', '80%', '20%', '70%', '50%', '30%'][i],
            top: ['20%', '10%', '70%', '60%', '40%', '85%'][i],
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Billiard table felt texture hint */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(250,173,20,0.03) 1px, transparent 0)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: 420, padding: '0 24px', zIndex: 1 }}
      >
        <Card
          bordered={false}
          style={{
            borderRadius: 20,
            background: 'rgba(15, 41, 30, 0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(250, 173, 20, 0.3)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(250,173,20,0.1)',
            padding: '8px',
          }}
        >
          {/* Logo area */}
          <div style={{ textAlign: 'center', marginBottom: 36, paddingTop: 8 }}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              style={{ display: 'inline-block', marginBottom: 16 }}
            >
              <div style={{
                width: 72, height: 72, borderRadius: 20, margin: '0 auto',
                background: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(250, 173, 20, 0.5)',
              }}>
                <TrophyOutlined style={{ fontSize: 36, color: '#000' }} />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2, color: '#faad14', lineHeight: 1 }}>
                PRIME
              </div>
              <div style={{ fontSize: 14, letterSpacing: 4, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                BILLIARD CLUB
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Boshqaruv tizimiga xush kelibsiz
              </Text>
            </motion.div>
          </div>

          {/* Login form */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
              <Form.Item name="username" rules={[{ required: true, message: 'Username kiriting' }]}>
                <Input
                  prefix={<UserOutlined style={{ color: '#faad14' }} />}
                  placeholder="Login (username)"
                  size="large"
                  style={{ borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(250,173,20,0.2)' }}
                />
              </Form.Item>

              <Form.Item name="password" rules={[{ required: true, message: 'Parol kiriting' }]}>
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#faad14' }} />}
                  placeholder="Parol"
                  size="large"
                  style={{ borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(250,173,20,0.2)' }}
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loading}
                  style={{
                    borderRadius: 10,
                    height: 50,
                    fontSize: 16,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
                    border: 'none',
                    color: '#000',
                    boxShadow: '0 8px 20px rgba(250, 173, 20, 0.4)',
                  }}
                >
                  Kirish
                </Button>
              </Form.Item>
            </Form>
          </motion.div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              © 2024 Prime Billiard Club · Barcha huquqlar himoyalangan
            </Text>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
