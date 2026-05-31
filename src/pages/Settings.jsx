import React from 'react';
import { Typography, Card, Result, Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Settings = () => {
  return (
    <div>
      <div className="mb-3">
        <Title level={3} style={{ margin: 0 }}>Sozlamalar</Title>
        <Text type="secondary">Tizimning umumiy parametrlari</Text>
      </div>
      <Card bordered={false} className="table-card glass-panel" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          icon={<SettingOutlined style={{ color: '#722ed1' }} />}
          title="Klub sozlamalari"
          subTitle="Klub nomi, soliq stavkalari va ish vaqtini belgilash sozlamalari tayyorlanmoqda."
          extra={<Button type="primary">Yangilash</Button>}
        />
      </Card>
    </div>
  );
};

export default Settings;
