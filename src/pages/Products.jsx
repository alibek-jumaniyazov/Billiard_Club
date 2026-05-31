import React, { useState, useEffect } from 'react';
import { Table, Card, Typography, Button, Modal, Form, Input, InputNumber, Select, message, Space, Popconfirm, Tag, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CoffeeOutlined, TagsOutlined } from '@ant-design/icons';
import { productsApi, categoriesApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;
const { Option } = Select;

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  
  const [productForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  
  const { hasRole } = useAuth();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        productsApi.getAll(),
        categoriesApi.getAll()
      ]);
      setProducts(prodRes.data.data);
      setCategories(catRes.data.data);
    } catch (error) {
      message.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Category Handlers ---
  const handleAddEditCategory = async (values) => {
    try {
      if (editingCategory) {
        await categoriesApi.update(editingCategory.id, values);
        message.success('Toifa yangilandi');
      } else {
        await categoriesApi.create(values);
        message.success("Toifa qo'shildi");
      }
      setIsCategoryModalOpen(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  // --- Product Handlers ---
  const handleAddEditProduct = async (values) => {
    try {
      if (editingProduct) {
        await productsApi.update(editingProduct.id, values);
        message.success('Mahsulot yangilandi');
      } else {
        await productsApi.create(values);
        message.success("Mahsulot qo'shildi");
      }
      setIsProductModalOpen(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await productsApi.delete(id);
      message.success("Mahsulot o'chirildi");
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const openProductModal = (product = null) => {
    setEditingProduct(product);
    if (product) {
      productForm.setFieldsValue(product);
    } else {
      productForm.resetFields();
    }
    setIsProductModalOpen(true);
  };

  const openCategoryModal = (category = null) => {
    setEditingCategory(category);
    if (category) {
      categoryForm.setFieldsValue(category);
    } else {
      categoryForm.resetFields();
    }
    setIsCategoryModalOpen(true);
  };

  const productColumns = [
    { title: 'Nomi', dataIndex: 'name', key: 'name', render: (text) => <strong>{text}</strong> },
    { title: 'Toifa', dataIndex: 'categoryId', key: 'categoryId', render: (catId) => {
        const cat = categories.find(c => c.id === catId);
        return <Tag color="blue">{cat ? cat.name : 'Noma\'lum'}</Tag>;
    }},
    { title: 'Narxi', dataIndex: 'price', key: 'price', render: (price) => `${parseFloat(price).toLocaleString()} so'm` },
    { title: 'Qoldiq (Sklad)', dataIndex: 'stock', key: 'stock', render: (stock, record) => (
        <Tag color={stock > 10 ? 'success' : stock > 0 ? 'warning' : 'error'}>
          {stock} {record.unit}
        </Tag>
    )},
    { title: 'Status', dataIndex: 'isActive', key: 'isActive', render: (active) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Aktiv' : 'Nofaol'}</Tag>
    )},
    { title: 'Amallar', key: 'actions', render: (_, record) => (
        <Space>
          <Button type="text" className="text-primary" icon={<EditOutlined />} onClick={() => openProductModal(record)} />
          {hasRole(['admin']) && (
            <Popconfirm title="Rostdan ham o'chirmoqchimisiz?" onConfirm={() => handleDeleteProduct(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
    )}
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" className="mb-3">
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--primary-color)' }}>Bar & Mahsulotlar</Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<TagsOutlined />} onClick={() => openCategoryModal()}>
              Yangi Toifa
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openProductModal()}>
              Mahsulot qo'shish
            </Button>
          </Space>
        </Col>
      </Row>

      <Card className="table-card" bordered={false}>
        <Table 
          columns={productColumns} 
          dataSource={products} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Product Modal */}
      <Modal title={editingProduct ? "Mahsulotni tahrirlash" : "Yangi mahsulot"} open={isProductModalOpen} onCancel={() => setIsProductModalOpen(false)} footer={null}>
        <Form form={productForm} layout="vertical" onFinish={handleAddEditProduct}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}><Input placeholder="Coca Cola 1L" /></Form.Item>
          <Form.Item name="categoryId" label="Toifa" rules={[{ required: true }]}>
            <Select placeholder="Toifani tanlang">
              {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="price" label="Sotuv narxi (so'm)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={1000} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock" label="Ombordagi qoldiq" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="unit" label="O'lchov birligi" initialValue="dona">
            <Select>
              <Option value="dona">Dona</Option>
              <Option value="litr">Litr</Option>
              <Option value="kg">Kilo</Option>
              <Option value="quti">Quti</Option>
            </Select>
          </Form.Item>
          {editingProduct && (
            <Form.Item name="isActive" label="Status">
              <Select>
                <Option value={true}>Aktiv</Option>
                <Option value={false}>Nofaol</Option>
              </Select>
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block>Saqlash</Button>
        </Form>
      </Modal>

      {/* Category Modal */}
      <Modal title="Toifa qo'shish/tahrirlash" open={isCategoryModalOpen} onCancel={() => setIsCategoryModalOpen(false)} footer={null}>
        <Form form={categoryForm} layout="vertical" onFinish={handleAddEditCategory}>
          <Form.Item name="name" label="Toifa nomi" rules={[{ required: true }]}><Input placeholder="Ichimliklar" /></Form.Item>
          <Button type="primary" htmlType="submit" block>Saqlash</Button>
        </Form>
      </Modal>

    </div>
  );
};

export default Products;
