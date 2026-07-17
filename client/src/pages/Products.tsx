import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CoffeeOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { categoriesApi, errorMessage, productsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Category, Product } from '../types';
import { formatMoney, formatNumber } from '../utils/format';

const { Title, Text } = Typography;

/** O'lchov birliklari — tarjimasi products.unit_<qiymat> kalitida */
const UNITS = ['dona', 'paket', 'piyola', 'litr'] as const;

/** Qoldiq rangi: 0 — qizil, 10 dan kam — sariq, aks holda yashil */
const stockColor = (stock: number): string =>
  stock <= 0 ? 'red' : stock < 10 ? 'orange' : 'green';

interface ProductFormValues {
  categoryId: number;
  name: string;
  price: number;
  stock: number;
  unit: string;
  description?: string;
}

interface CategoryFormValues {
  name: string;
  description?: string;
}

const Products = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'superadmin');

  // Mahsulotlar (server pagination)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined);

  // Kategoriyalar
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm] = Form.useForm<ProductFormValues>();
  const [savingProduct, setSavingProduct] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm] = Form.useForm<CategoryFormValues>();
  const [savingCategory, setSavingCategory] = useState(false);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await productsApi.list({
        page,
        limit: pageSize,
        search: search || undefined,
        categoryId: categoryFilter,
      });
      setProducts(res.data);
      setTotal(res.pagination?.total ?? res.data.length);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setProductsLoading(false);
    }
  }, [page, pageSize, search, categoryFilter, message, t]);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await categoriesApi.list();
      setCategories(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCategoriesLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  const unitLabel = (unit: string): string =>
    (UNITS as readonly string[]).includes(unit) ? t(`products.unit_${unit}`) : unit;

  // ---------- Mahsulot ----------
  const openCreateProduct = () => {
    setEditingProduct(null);
    productForm.resetFields();
    setProductModalOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    productForm.setFieldsValue({
      categoryId: product.categoryId,
      name: product.name,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
      description: product.description ?? undefined,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async () => {
    const values = await productForm.validateFields();
    setSavingProduct(true);
    try {
      const res = editingProduct
        ? await productsApi.update(editingProduct.id, values)
        : await productsApi.create(values);
      message.success(res.message);
      setProductModalOpen(false);
      void fetchProducts();
      void fetchCategories();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      const res = await productsApi.remove(product.id);
      message.success(res.message);
      void fetchProducts();
      void fetchCategories();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Kategoriya ----------
  const openCreateCategory = () => {
    setEditingCategory(null);
    categoryForm.resetFields();
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    categoryForm.setFieldsValue({
      name: category.name,
      description: category.description ?? undefined,
    });
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async () => {
    const values = await categoryForm.validateFields();
    setSavingCategory(true);
    try {
      const res = editingCategory
        ? await categoriesApi.update(editingCategory.id, values)
        : await categoriesApi.create(values);
      message.success(res.message);
      setCategoryModalOpen(false);
      void fetchCategories();
      void fetchProducts();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    try {
      const res = await categoriesApi.remove(category.id);
      message.success(res.message);
      if (categoryFilter === category.id) setCategoryFilter(undefined);
      void fetchCategories();
    } catch (err) {
      // Server mahsulotli kategoriyani o'chirishni bloklaydi — xabarini ko'rsatamiz
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const productColumns: ColumnsType<Product> = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      render: (name: string, product) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {product.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {product.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('products.category'),
      key: 'category',
      width: 180,
      render: (_, product) => (
        <Tag color="blue">{product.category?.name ?? t('products.noCategory')}</Tag>
      ),
    },
    {
      title: t('common.price'),
      dataIndex: 'price',
      width: 160,
      render: (price: number) => formatMoney(price, t('common.sum')),
    },
    {
      title: t('products.stock'),
      dataIndex: 'stock',
      width: 150,
      render: (stock: number, product) => (
        <Tag color={stockColor(stock)}>
          {formatNumber(stock)} {unitLabel(product.unit)}
        </Tag>
      ),
    },
  ];
  if (canManage) {
    productColumns.push({
      title: t('common.actions'),
      key: 'actions',
      width: 110,
      render: (_, product) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditProduct(product)} />
          <Popconfirm
            title={t('common.confirmDelete')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => void handleDeleteProduct(product)}
          >
            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    });
  }

  const categoryColumns: ColumnsType<Category> = [
    {
      title: t('products.categoryName'),
      dataIndex: 'name',
      render: (name: string, category) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {category.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {category.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('products.productCount'),
      key: 'productCount',
      width: 180,
      render: (_, category) => <Tag>{category.products?.length ?? 0}</Tag>,
    },
  ];
  if (canManage) {
    categoryColumns.push({
      title: t('common.actions'),
      key: 'actions',
      width: 110,
      render: (_, category) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditCategory(category)} />
          <Popconfirm
            title={t('products.deleteCategoryConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => void handleDeleteCategory(category)}
          >
            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 0 }}>
            <CoffeeOutlined /> {t('products.title')}
          </Title>
          <Text type="secondary">{t('products.subtitle')}</Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            void fetchProducts();
            void fetchCategories();
          }}
        />
      </div>

      <Tabs
        defaultActiveKey="products"
        items={[
          {
            key: 'products',
            label: (
              <span>
                <CoffeeOutlined /> {t('products.tabProducts')}
              </span>
            ),
            children: (
              <Card>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <Space wrap>
                    <Input.Search
                      allowClear
                      placeholder={t('products.searchPlaceholder')}
                      style={{ width: 240 }}
                      onSearch={(value) => {
                        setPage(1);
                        setSearch(value.trim());
                      }}
                    />
                    <Select
                      allowClear
                      placeholder={t('products.allCategories')}
                      style={{ width: 220 }}
                      value={categoryFilter}
                      onChange={(value?: number) => {
                        setPage(1);
                        setCategoryFilter(value);
                      }}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Space>
                  {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateProduct}>
                      {t('products.addProduct')}
                    </Button>
                  )}
                </div>
                <Table
                  rowKey="id"
                  columns={productColumns}
                  dataSource={products}
                  loading={productsLoading}
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    onChange: (p, ps) => {
                      setPage(ps !== pageSize ? 1 : p);
                      setPageSize(ps);
                    },
                  }}
                  scroll={{ x: 760 }}
                />
              </Card>
            ),
          },
          {
            key: 'categories',
            label: (
              <span>
                <TagsOutlined /> {t('products.tabCategories')}
              </span>
            ),
            children: (
              <Card>
                {canManage && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCategory}>
                      {t('products.addCategory')}
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={categoryColumns}
                  dataSource={categories}
                  loading={categoriesLoading}
                  pagination={false}
                  scroll={{ x: 520 }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Mahsulot yaratish/tahrirlash */}
      <Modal
        title={editingProduct ? t('products.editProduct') : t('products.addProduct')}
        open={productModalOpen}
        onCancel={() => setProductModalOpen(false)}
        onOk={() => void handleSaveProduct()}
        confirmLoading={savingProduct}
        okText={editingProduct ? t('btn.save') : t('btn.add')}
        cancelText={t('btn.cancel')}
      >
        <Form form={productForm} layout="vertical" initialValues={{ unit: 'dona', stock: 0 }}>
          <Form.Item
            name="name"
            label={t('common.name')}
            rules={[{ required: true, message: t('products.nameRequired') }]}
          >
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item
            name="categoryId"
            label={t('products.category')}
            rules={[{ required: true, message: t('products.categoryRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('products.selectCategory')}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="price"
                label={`${t('common.price')} (${t('common.sum')})`}
                rules={[{ required: true, message: t('products.priceRequired') }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={1000} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="stock"
                label={t('products.stock')}
                rules={[{ required: true, message: t('products.stockRequired') }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="unit" label={t('products.unit')}>
            <Select options={UNITS.map((u) => ({ value: u, label: t(`products.unit_${u}`) }))} />
          </Form.Item>
          <Form.Item name="description" label={t('products.description')}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Kategoriya yaratish/tahrirlash */}
      <Modal
        title={editingCategory ? t('products.editCategory') : t('products.addCategory')}
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        onOk={() => void handleSaveCategory()}
        confirmLoading={savingCategory}
        okText={editingCategory ? t('btn.save') : t('btn.add')}
        cancelText={t('btn.cancel')}
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('products.categoryName')}
            rules={[{ required: true, message: t('products.categoryNameRequired') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t('products.description')}>
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Products;
