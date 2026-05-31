import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, message, Divider, Segmented, Statistic, Switch, Badge, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, CoffeeOutlined, StopOutlined, PauseCircleOutlined, CaretRightOutlined, CloseCircleOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import { tablesApi, sessionsApi, productsApi, ordersApi } from '../api';
import { useAuth } from '../context/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// =================== JONLI TAYMER ===================
const LiveSession = ({ session, pricePerHour }) => {
  const [duration, setDuration] = useState({ hours: 0, mins: 0, secs: 0 });
  const [currentAmount, setCurrentAmount] = useState(0);

  useEffect(() => {
    if (!session || !session.startTime) return;

    const calculate = () => {
      const start = dayjs(session.startTime);
      const now = dayjs();
      let diffMs = now.diff(start);
      const totalPausedMs = parseInt(session.totalPausedMs || 0);

      // Agar pauzada bo'lsa — faqat pauza boshigacha hisoblash
      if (session.status === 'paused' && session.pausedAt) {
        const pauseStart = dayjs(session.pausedAt);
        diffMs = pauseStart.diff(start) - totalPausedMs;
      } else {
        diffMs = diffMs - totalPausedMs;
      }

      diffMs = Math.max(0, diffMs);
      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      const diffHours = totalSeconds / 3600;
      const amount = diffHours * parseFloat(pricePerHour);

      setDuration({ hours, mins, secs });
      setCurrentAmount(amount);
    };

    calculate();
    // Pauzada bo'lsa har sekund yangilamaslik kerak
    if (session.status === 'paused') return;
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [session, pricePerHour]);

  const pad = (n) => n.toString().padStart(2, '0');
  const isPaused = session?.status === 'paused';

  return (
    <div style={{ margin: '16px 0' }}>
      <div className={`timer-display ${isPaused ? 'timer-paused' : ''}`}>
        {isPaused && <span className="pause-badge">⏸ PAUZA</span>}
        {pad(duration.hours)}:{pad(duration.mins)}:{pad(duration.secs)}
      </div>
      <div className="price-display">
        {new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', minimumFractionDigits: 0 }).format(currentAmount)}
      </div>
    </div>
  );
};

// =================== JONLI CHEK ===================
const LiveReceipt = ({ session, pricePerHour }) => {
  const [tableAmount, setTableAmount] = useState(0);

  useEffect(() => {
    if (!session || !session.startTime) return;

    const calculate = () => {
      const start = dayjs(session.startTime);
      const now = dayjs();
      let diffMs = now.diff(start);
      const totalPausedMs = parseInt(session.totalPausedMs || 0);

      if (session.status === 'paused' && session.pausedAt) {
        const pauseStart = dayjs(session.pausedAt);
        diffMs = pauseStart.diff(start) - totalPausedMs;
      } else {
        diffMs = diffMs - totalPausedMs;
      }

      diffMs = Math.max(0, diffMs);
      const totalSeconds = Math.floor(diffMs / 1000);
      const diffHours = totalSeconds / 3600;
      const amount = diffHours * parseFloat(pricePerHour);
      setTableAmount(amount);
    };

    calculate();
    if (session?.status === 'paused') return;
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [session, pricePerHour]);

  const barAmount = parseFloat(session?.barAmount || 0);
  const totalAmount = tableAmount + barAmount;

  return (
    <>
      <div className="d-flex justify-between mb-1">
        <Text>Stol xarajati:</Text>
        <Text strong style={{ color: '#52c41a', fontSize: '16px' }}>{Math.floor(tableAmount).toLocaleString()} so'm</Text>
      </div>
      <div className="d-flex justify-between mb-2">
        <Text>Bar xarajati:</Text>
        <Text strong style={{ color: '#faad14', fontSize: '16px' }}>{barAmount.toLocaleString()} so'm</Text>
      </div>
      <Divider style={{ borderColor: 'rgba(255,255,255,0.15)', margin: '16px 0' }} />
      <div className="d-flex justify-between align-center">
        <Text style={{ fontSize: '18px', fontWeight: 600 }}>UMUMIY JAMI:</Text>
        <Text strong style={{ color: '#faad14', fontSize: '24px' }}>{Math.floor(totalAmount).toLocaleString()} so'm</Text>
      </div>
    </>
  );
};

const Tables = () => {
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('barchasi');
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  
  // Selected Data
  const [editingTable, setEditingTable] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Forms
  const [form] = Form.useForm();
  const [startForm] = Form.useForm();
  const [orderForm] = Form.useForm();
  const [endForm] = Form.useForm();
  
  const { hasRole } = useAuth();

  // Watch items
  const orderItems = Form.useWatch('items', orderForm);
  const isDebt = Form.useWatch('isDebt', endForm);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tablesRes, productsRes] = await Promise.all([
        tablesApi.getAll({ limit: 100 }),
        productsApi.getAll({ limit: 500 })
      ]);
      setTables(tablesRes.data.data);
      setProducts(productsRes.data.data);
    } catch (error) {
      message.error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); 
    return () => clearInterval(interval);
  }, []);

  // =================== STOL CRUD ===================
  const handleAddEdit = async (values) => {
    try {
      if (editingTable) {
        await tablesApi.update(editingTable.id, values);
        message.success('Stol yangilandi');
      } else {
        await tablesApi.create(values);
        message.success("Stol qo'shildi");
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleDeleteTable = async () => {
    if (!editingTable) return;
    Modal.confirm({
      title: "Stolni o'chirmoqchimisiz?",
      content: "Ushbu amalni ortga qaytarib bo'lmaydi.",
      okText: 'O\'chirish',
      okType: 'danger',
      cancelText: 'Bekor qilish',
      onOk: async () => {
        try {
          await tablesApi.delete(editingTable.id);
          message.success("Stol o'chirildi");
          setIsModalOpen(false);
          fetchData();
        } catch (error) {
          message.error(error.response?.data?.message || "Stolni o'chirib bo'lmadi");
        }
      }
    });
  };

  // =================== SESSIYA BOSHLASH (MULTI-SESSION) ===================
  const handleStartSession = async (values) => {
    try {
      const activeSession = selectedTable.sessions?.[0];
      
      // Agar faol o'yin bo'lsa, foydalanuvchidan tasdiqlash so'raymiz
      if (activeSession) {
        Modal.confirm({
          title: "⚠️ Bu stolda faol o'yin bor!",
          content: "Yangi o'yin boshlasangiz, joriy o'yin yakunlanadi va summasi saqlanadi. Davom etasizmi?",
          okText: "Ha, yangi o'yin boshlash",
          cancelText: 'Bekor qilish',
          okType: 'primary',
          onOk: async () => {
            const res = await sessionsApi.start({ ...values, tableId: selectedTable.id });
            if (res.data.data.closedSession) {
              message.info(`Oldingi o'yin yakunlandi: ${parseFloat(res.data.data.closedSession.totalAmount).toLocaleString()} so'm`);
            }
            message.success("Yangi o'yin boshlandi!");
            setIsStartModalOpen(false);
            fetchData();
          },
        });
      } else {
        await sessionsApi.start({ ...values, tableId: selectedTable.id });
        message.success("O'yin boshlandi");
        setIsStartModalOpen(false);
        fetchData();
      }
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  // =================== PAUZA / DAVOM ===================
  const handlePause = async (table) => {
    try {
      const activeSession = table.sessions?.[0];
      if (!activeSession) return;
      await sessionsApi.pause(activeSession.id);
      message.success("⏸ O'yin pauzaga olindi");
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleResume = async (table) => {
    try {
      const activeSession = table.sessions?.[0];
      if (!activeSession) return;
      await sessionsApi.resume(activeSession.id);
      message.success("▶ O'yin davom ettirildi");
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  // =================== BEKOR QILISH (X) ===================
  const handleCancel = (table) => {
    const activeSession = table.sessions?.[0];
    if (!activeSession) return;

    Modal.confirm({
      title: "❌ Sessiyani bekor qilmoqchimisiz?",
      content: (
        <div>
          <Text type="danger" strong>Bu sessiya butunlay o'chiriladi!</Text>
          <br />
          <Text type="secondary">Tarixga yozilmaydi, hisob-kitob saqlanmaydi.</Text>
          <br />
          <Text type="secondary">Faqat bilmay boshlash bosilib ketgan holatlarda foydalaning.</Text>
        </div>
      ),
      okText: "Ha, bekor qilish",
      cancelText: 'Yo\'q',
      okType: 'danger',
      onOk: async () => {
        try {
          await sessionsApi.cancel(activeSession.id);
          message.success("Sessiya bekor qilindi — tarixga yozilmadi");
          fetchData();
        } catch (error) {
          message.error(error.response?.data?.message || 'Xatolik yuz berdi');
        }
      },
    });
  };

  // =================== BAR BUYURTMA ===================
  const handleCreateOrder = async (values) => {
    try {
      const activeSession = selectedTable.sessions?.[0];
      if (!activeSession) return message.error("Faol o'yin topilmadi. Sahifani yangilang.");
      if (!values.items || values.items.length === 0) {
        return message.warning("Mahsulot tanlanmadi");
      }
      await ordersApi.create({
        sessionId: activeSession.id,
        tableId: selectedTable.id,
        items: values.items
      });
      message.success("Buyurtma qo'shildi");
      setIsOrderModalOpen(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || "Buyurtma berishda xatolik");
    }
  };

  // =================== O'YINNI TUGATISH ===================
  const handleEndSession = async (values) => {
    try {
      const activeSession = selectedTable.sessions?.[0];
      if (!activeSession) return;
      const res = await sessionsApi.end(activeSession.id, values);
      const data = res.data.data;
      
      if (values.isDebt) {
        message.success(`Qarzga yozildi! Jami qarz: ${parseFloat(data.totalDebt).toLocaleString()} so'm`);
      } else {
        message.success(`O'yin yakunlandi! Jami: ${parseFloat(data.totalAmount).toLocaleString()} so'm`);
      }
      setIsEndModalOpen(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  // =================== MODAL TRIGGERS ===================
  const openEditModal = (table) => {
    setEditingTable(table);
    form.setFieldsValue(table);
    setIsModalOpen(true);
  };

  const openStartModal = (table) => {
    setSelectedTable(table);
    startForm.resetFields();
    setIsStartModalOpen(true);
  };

  const openOrderModal = (table) => {
    setSelectedTable(table);
    orderForm.resetFields();
    orderForm.setFieldsValue({ items: [{ productId: undefined, quantity: 1 }] });
    setIsOrderModalOpen(true);
  };

  const openEndModal = (table) => {
    setSelectedTable(table);
    const activeSession = table.sessions?.[0];
    endForm.setFieldsValue({ 
      paymentMethod: 'cash', 
      discount: 0,
      isDebt: false,
      isTableDebt: true,
      isBarDebt: activeSession?.barAmount > 0,
      customerName: activeSession?.customerName || '',
      customerPhone: activeSession?.customerPhone || '',
    });
    setIsEndModalOpen(true);
  };

  // =================== STATS & FILTERS ===================
  const totalTables = tables.length;
  const busyTables = tables.filter(t => t.status === 'band').length;
  const freeTables = tables.filter(t => t.status === 'bosh').length;

  const filteredTables = tables.filter(t => {
    if (filter === 'band') return t.status === 'band';
    if (filter === 'bosh') return t.status === 'bosh';
    return true;
  });

  // Calculate live order total in modal
  const calculateOrderTotal = () => {
    if (!orderItems) return 0;
    let total = 0;
    orderItems.forEach(item => {
      if (item && item.productId && item.quantity) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) total += parseFloat(prod.price) * item.quantity;
      }
    });
    return total;
  };

  return (
    <div>
      <Row justify="space-between" align="middle" className="mb-3">
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>Billiard Stollari</Title>
        </Col>
        <Col>
          {hasRole(['admin']) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingTable(null); form.resetFields(); setIsModalOpen(true); }}>
              Yangi Stol
            </Button>
          )}
        </Col>
      </Row>

      {/* Stats and Filter */}
      <Card bordered={false} style={{ marginBottom: 24, background: 'var(--bg-card-dark)' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="large">
              <Statistic title="Jami stollar" value={totalTables} valueStyle={{ color: 'var(--primary-color)' }} />
              <Statistic title="Band stollar" value={busyTables} valueStyle={{ color: 'var(--warning-color)' }} />
              <Statistic title="Bo'sh stollar" value={freeTables} valueStyle={{ color: 'var(--success-color)' }} />
            </Space>
          </Col>
          <Col>
            <Segmented 
              options={[
                { label: 'Barchasi', value: 'barchasi' },
                { label: 'Band', value: 'band' },
                { label: 'Bo\'sh', value: 'bosh' },
              ]}
              value={filter}
              onChange={setFilter}
              size="large"
            />
          </Col>
        </Row>
      </Card>

      {/* =================== STOL KARTALARI =================== */}
      <Row gutter={[24, 24]}>
        {filteredTables.map(table => {
          const isBusy = table.status === 'band';
          const activeSession = table.sessions?.[0];
          const isPaused = activeSession?.status === 'paused';
          const todayCompleted = table.todayCompletedSessions || 0;

          return (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} key={table.id}>
              <Card 
                className={`table-card ${isBusy ? (isPaused ? 'table-card-paused' : 'table-card-active') : ''}`} 
                bordered={false}
                extra={
                  isBusy ? (
                    <Tooltip title="Sessiyani bekor qilish (tarixga yozilmaydi)">
                      <Button 
                        type="text" 
                        danger 
                        size="small"
                        icon={<CloseCircleOutlined />} 
                        onClick={(e) => { e.stopPropagation(); handleCancel(table); }}
                        className="cancel-btn"
                      />
                    </Tooltip>
                  ) : null
                }
                actions={
                  isBusy 
                  ? [
                      // Pauza/Davom tugmasi
                      isPaused ? (
                        <Button type="text" className="text-success" icon={<CaretRightOutlined />} onClick={() => handleResume(table)}>
                          Davom
                        </Button>
                      ) : (
                        <Button type="text" style={{ color: '#fadb14' }} icon={<PauseCircleOutlined />} onClick={() => handlePause(table)}>
                          Pauza
                        </Button>
                      ),
                      <Button type="text" className="text-warning" icon={<CoffeeOutlined />} onClick={() => openOrderModal(table)}>
                        Bar
                      </Button>,
                      <Button type="text" className="text-danger" icon={<StopOutlined />} onClick={() => openEndModal(table)}>
                        Tugatish
                      </Button>,
                    ]
                  : [
                      <Button type="text" className="text-success" icon={<PlayCircleOutlined />} onClick={() => openStartModal(table)}>
                        Boshlash
                      </Button>,
                      hasRole(['admin', 'kassir']) ? <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(table)}>Tahrirlash</Button> : null
                    ].filter(Boolean)
                }
              >
                <div className="text-center">
                  <Title level={4} style={{ margin: '0 0 4px 0', color: isBusy ? (isPaused ? '#fadb14' : 'var(--warning-color)') : 'var(--success-color)' }}>
                    Stol {table.number}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>{table.name}</Text>

                  {/* Bugungi sessiyalar soni */}
                  {todayCompleted > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Tag color="blue" style={{ fontSize: 11, borderRadius: 10 }}>
                        <HistoryOutlined /> Bugun: {todayCompleted} sessiya
                      </Tag>
                    </div>
                  )}
                  
                  {isBusy && activeSession ? (
                    <>
                      <div className="mt-1">
                        <Text strong style={{ color: '#fff', fontSize: 13 }}>
                          {activeSession.customerName || 'Mijoz'}
                        </Text>
                      </div>
                      <LiveSession session={activeSession} pricePerHour={table.pricePerHour} />
                      {parseFloat(activeSession.barAmount) > 0 && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Bar: <span className="text-warning">{parseFloat(activeSession.barAmount).toLocaleString()} so'm</span>
                          </Text>
                        </div>
                      )}
                      {/* Yangi sessiya boshlash tugmasi */}
                      <div style={{ marginTop: 8 }}>
                        <Button 
                          size="small" 
                          type="dashed"
                          icon={<ReloadOutlined />}
                          onClick={() => openStartModal(table)}
                          style={{ fontSize: 11, borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)' }}
                        >
                          Yangi sessiya
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 mb-3">
                      <Tag color="success" style={{ fontSize: '14px', padding: '6px 16px', borderRadius: '20px' }}>Bo'sh (Kutmoqda)</Tag>
                      <div className="mt-3">
                        <Text strong>{parseInt(table.pricePerHour).toLocaleString()} so'm / soat</Text>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          );
        })}
        {filteredTables.length === 0 && (
          <Col span={24} className="text-center p-3">
            <Text type="secondary">Stollar topilmadi.</Text>
          </Col>
        )}
      </Row>

      {/* =================== 1. STOL ADD/EDIT MODAL =================== */}
      <Modal title={editingTable ? "Stolni tahrirlash" : "Yangi stol qo'shish"} open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleAddEdit}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}><Input placeholder="Masalan: VIP stol" /></Form.Item>
          <Form.Item name="number" label="Raqami" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item name="pricePerHour" label="Soatlik narxi (so'm)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={1000} /></Form.Item>
          {editingTable && (
            <Form.Item name="status" label="Status"><Select><Select.Option value="bosh">Bo'sh</Select.Option><Select.Option value="band">Band</Select.Option></Select></Form.Item>
          )}
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="primary" htmlType="submit" block size="large">Saqlash</Button>
            {editingTable && hasRole(['admin']) && (
              <Button danger type="dashed" block onClick={handleDeleteTable} icon={<DeleteOutlined />}>Stolni butunlay o'chirish</Button>
            )}
          </Space>
        </Form>
      </Modal>

      {/* =================== 2. O'YINNI BOSHLASH MODAL =================== */}
      <Modal 
        title={
          <Space>
            <PlayCircleOutlined style={{ color: 'var(--success-color)' }} />
            <span>O'yinni boshlash: Stol {selectedTable?.number}</span>
          </Space>
        } 
        open={isStartModalOpen} 
        onCancel={() => setIsStartModalOpen(false)} 
        footer={null}
      >
        {/* Agar faol sessiya bo'lsa — ogohlantirish */}
        {selectedTable?.sessions?.[0] && (
          <div style={{ 
            background: 'rgba(250, 173, 20, 0.15)', 
            border: '1px solid rgba(250, 173, 20, 0.4)', 
            borderRadius: 8, 
            padding: 12, 
            marginBottom: 16 
          }}>
            <Text strong style={{ color: '#faad14' }}>⚠️ Bu stolda faol o'yin bor!</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Yangi o'yin boshlasangiz, joriy o'yin yakunlanadi va summasi saqlanadi.
            </Text>
          </div>
        )}

        <Form form={startForm} layout="vertical" onFinish={handleStartSession}>
          <Form.Item name="customerName" label="Mijoz ismi (ixtiyoriy)"><Input placeholder="Mijoz ismi" /></Form.Item>
          <Form.Item name="customerPhone" label="Telefon raqami (ixtiyoriy)"><Input placeholder="+998901234567" /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" icon={<PlayCircleOutlined />}>
            {selectedTable?.sessions?.[0] ? "Oldingi o'yinni yakunlab, yangisini boshlash" : "Vaqtni boshlash"}
          </Button>
        </Form>
      </Modal>

      {/* =================== 3. BAR BUYURTMA MODAL =================== */}
      <Modal title={`Bar xizmati (Stol ${selectedTable?.number})`} open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null} width={600}>
        <Form form={orderForm} layout="vertical" onFinish={handleCreateOrder}>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={16} align="middle" style={{ marginBottom: 8 }}>
                    <Col span={14}>
                      <Form.Item {...restField} name={[name, 'productId']} rules={[{ required: true, message: 'Tanlang' }]} style={{ margin: 0 }}>
                        <Select showSearch placeholder="Mahsulotni tanlang" filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                          options={products.filter(p => p.isActive).map(p => ({ value: p.id, label: `${p.name} (${parseFloat(p.price).toLocaleString()} so'm)` }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: 'Miqdor' }]} style={{ margin: 0 }}>
                        <InputNumber min={1} placeholder="Miqdor" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Button danger onClick={() => remove(name)} icon={<DeleteOutlined />} block />
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Yana qator qo'shish</Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <div style={{ padding: '12px', background: 'rgba(250, 173, 20, 0.1)', border: '1px solid var(--primary-color)', borderRadius: '8px', marginBottom: '16px', textAlign: 'right' }}>
            <Text>Ushbu xarid summasi:</Text>
            <Title level={4} style={{ margin: 0, color: 'var(--primary-color)' }}>{calculateOrderTotal().toLocaleString()} so'm</Title>
          </div>

          <Button type="primary" htmlType="submit" block size="large">Hisobga qo'shish</Button>
        </Form>
      </Modal>

      {/* =================== 4. O'YINNI TUGATISH VA HISOB MODAL =================== */}
      <Modal 
        title={`Hisob-kitob (Stol ${selectedTable?.number})`} 
        open={isEndModalOpen} 
        onCancel={() => setIsEndModalOpen(false)} 
        footer={null}
        width={520}
      >
        {/* ===== CHEK ===== */}
        <div style={{ padding: '20px', background: '#0a1c14', borderRadius: '12px', marginBottom: '16px', border: '1px dashed #faad14' }}>
          <Title level={5} style={{ color: 'var(--primary-color)', textAlign: 'center', marginBottom: 16 }}>PRIME BILLIARD CHEKI</Title>
          
          <div className="d-flex justify-between mb-1">
            <Text type="secondary">Mijoz:</Text>
            <Text strong>{selectedTable?.sessions?.[0]?.customerName || 'Odatiy'}</Text>
          </div>
          <div className="d-flex justify-between mb-1">
            <Text type="secondary">Boshlandi:</Text>
            <Text strong>{selectedTable?.sessions?.[0]?.startTime ? dayjs(selectedTable.sessions[0].startTime).format('HH:mm:ss') : '-'}</Text>
          </div>
          {selectedTable?.sessions?.[0]?.status === 'paused' && (
            <div className="d-flex justify-between mb-1">
              <Text type="secondary">Holat:</Text>
              <Tag color="warning">⏸ PAUZADA</Tag>
            </div>
          )}
          <Divider style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
          
          <LiveReceipt session={selectedTable?.sessions?.[0]} pricePerHour={selectedTable?.pricePerHour} />
          
          <div className="text-center mt-3">
            <Text type="secondary" style={{ fontSize: '12px' }}>Stol summasi tizim tomonidan sekundigacha aniq hisoblab chiqiladi.</Text>
          </div>
        </div>

        {/* ===== FORM ===== */}
        <Form form={endForm} layout="vertical" onFinish={handleEndSession}>
          {/* Qarzga yozish */}
          <div style={{ 
            background: isDebt ? 'rgba(245, 34, 45, 0.1)' : 'rgba(250, 173, 20, 0.08)', 
            padding: 16, 
            borderRadius: 12, 
            marginBottom: 16,
            border: isDebt ? '1px solid rgba(245, 34, 45, 0.3)' : '1px solid rgba(250, 173, 20, 0.2)',
            transition: 'all 0.3s ease',
          }}>
            <Form.Item name="isDebt" valuePropName="checked" style={{ marginBottom: isDebt ? 16 : 0 }}>
              <div className="d-flex align-center gap-2">
                <Switch checkedChildren="Qarzga" unCheckedChildren="To'lash" />
                <Text style={{ fontWeight: 600 }}>Ushbu chek qarzga yoziladimi?</Text>
              </div>
            </Form.Item>

            {isDebt && (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="customerName" label="Mijoz ismi" rules={[{ required: true, message: 'Ism kiriting' }]}>
                      <Input placeholder="Ismni kiriting" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="customerPhone" label="Telefon raqami">
                      <Input placeholder="+998..." />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="isTableDebt" valuePropName="checked" style={{ margin: 0 }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8 }}>
                        <Switch checkedChildren="✓" unCheckedChildren="✗" />
                        <Text style={{ marginLeft: 8, fontSize: 13 }}>Stol qarzga</Text>
                      </div>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="isBarDebt" valuePropName="checked" style={{ margin: 0 }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8 }}>
                        <Switch checkedChildren="✓" unCheckedChildren="✗" />
                        <Text style={{ marginLeft: 8, fontSize: 13 }}>Bar qarzga</Text>
                      </div>
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245, 34, 45, 0.15)', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    📋 Qarzga qaysi qismlar yozilishini belgilang. Tizim aniq summani avtomatik hisoblab qarzga yozadi.
                  </Text>
                </div>
              </>
            )}
          </div>

          {!isDebt && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="paymentMethod" label="To'lov usuli" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="cash">💵 Naqd pul</Select.Option>
                    <Select.Option value="card">💳 Plastik karta</Select.Option>
                    <Select.Option value="transfer">📲 Pul o'tkazmasi</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="discount" label="Chegirma (so'm)">
                  <InputNumber style={{ width: '100%' }} min={0} step={1000} />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Button 
            type="primary" 
            danger={!isDebt} 
            htmlType="submit" 
            block 
            size="large" 
            icon={isDebt ? null : <StopOutlined />}
            style={isDebt ? { background: '#cf1322', borderColor: '#cf1322' } : {}}
          >
            {isDebt ? "📋 Qarzga yozish va Yakunlash" : "O'yinni tugatish va To'lash"}
          </Button>
        </Form>
      </Modal>

    </div>
  );
};

export default Tables;
