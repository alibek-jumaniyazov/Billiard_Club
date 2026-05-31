import React from 'react';
import { Typography, Card, Result, Button } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Orders = () => {
  return (
    <div>
      <div className="mb-3">
        <Title level={3} style={{ margin: 0 }}>Buyurtmalar</Title>
        <Text type="secondary">Stollardan qilingan buyurtmalar</Text>
      </div>
      <Card bordered={false} className="table-card glass-panel" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          icon={<ShoppingCartOutlined style={{ color: 'var(--primary-color)' }} />}
          title="Buyurtmalar moduli tayyorlanmoqda"
          subTitle="O'yin davomida barga berilgan buyurtmalarni shu yerdan boshqarasiz."
          extra={<Button type="primary">Yangilash</Button>}
        />
      </Card>
    </div>
  );
};

export default Orders;
