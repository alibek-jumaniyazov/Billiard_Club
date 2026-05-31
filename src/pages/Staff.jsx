import React from 'react';
import { Typography, Card, Result, Button } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Staff = () => {
  return (
    <div>
      <div className="mb-3">
        <Title level={3} style={{ margin: 0 }}>Xodimlar</Title>
        <Text type="secondary">Tizim foydalanuvchilarini boshqarish (Faqat Admin uchun)</Text>
      </div>
      <Card bordered={false} className="table-card glass-panel" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          icon={<TeamOutlined style={{ color: 'var(--warning-color)' }} />}
          title="Xodimlar boshqaruvi"
          subTitle="Yangi xodimlarni qo'shish va ularning ruxsatlarini (role) belgilash hududi."
          extra={<Button type="primary">Yangilash</Button>}
        />
      </Card>
    </div>
  );
};

export default Staff;
