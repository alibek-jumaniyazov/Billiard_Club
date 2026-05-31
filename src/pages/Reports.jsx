import React from 'react';
import { Typography, Card, Result, Button } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Reports = () => {
  return (
    <div>
      <div className="mb-3">
        <Title level={3} style={{ margin: 0 }}>Hisobotlar</Title>
        <Text type="secondary">Kengaytirilgan tahlil va moliyaviy hisobotlar</Text>
      </div>
      <Card bordered={false} className="table-card glass-panel" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          icon={<BarChartOutlined style={{ color: 'var(--success-color)' }} />}
          title="Hisobotlar tahlili"
          subTitle="Kengaytirilgan jadvallar, PDF va Excel yuklab olish imkoniyatlari tez orada qo'shiladi."
          extra={<Button type="primary">Dashboardga qaytish</Button>}
        />
      </Card>
    </div>
  );
};

export default Reports;
