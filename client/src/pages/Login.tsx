import { useState } from 'react';
import { Button, Card, Form, Input, Typography, App, Segmented } from 'antd';
import { LockOutlined, TrophyOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../context/AppSettingsContext';

const { Title, Text } = Typography;

const Login = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { lang, setLang } = useAppSettings();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    const result = await login(values.username.trim(), values.password);
    setLoading(false);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      message.error(result.message || t('login.failed'));
    }
  };

  return (
    <div className="auth-page">
      <Card style={{ width: 400, maxWidth: '100%' }} styles={{ body: { padding: 32 } }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 16px',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #faad14, #d48806)',
              color: '#111',
              fontSize: 30,
            }}
          >
            <TrophyOutlined />
          </div>
          <Title level={3} style={{ marginBottom: 4 }}>
            PRIME BILLIARD
          </Title>
          <Text type="secondary">{t('login.subtitle')}</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item
            name="username"
            label={t('login.username')}
            rules={[{ required: true, message: t('login.usernameRequired') }]}
          >
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('login.password')}
            rules={[{ required: true, message: t('login.passwordRequired') }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('login.submit')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Segmented
            size="small"
            value={lang}
            onChange={(value) => setLang(value as 'uz' | 'ru')}
            options={[
              { label: "O'zbekcha", value: 'uz' },
              { label: 'Русский', value: 'ru' },
            ]}
          />
        </div>
      </Card>
    </div>
  );
};

export default Login;
