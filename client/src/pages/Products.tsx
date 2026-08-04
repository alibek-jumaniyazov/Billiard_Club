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
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  CoffeeOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { categoriesApi, errorMessage, productsApi } from '../api';
import {
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatusTag,
} from '../components/ui';
import { useCurrency } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import type { Category, Product } from '../types';
import { formatNumber, moneyFormatter, moneyParser } from '../utils/format';
import { isFormValidationError } from '../utils/formErrors';

const { Text } = Typography;

/** O'lchov birliklari — tarjimasi products.unit_<qiymat> kalitida */
const UNITS = ['dona', 'paket', 'piyola', 'litr'] as const;

/** Qoldiq semantikasi: 0 — xato, 10 dan kam — ogohlantirish, aks holda yaxshi */
const stockStatus = (stock: number): string =>
  stock <= 0 ? 'error' : stock < 10 ? 'warning' : 'success';

interface ProductFormValues {
  categoryId: number;
  name: string;
  price: number;
  /** Faqat YARATISHDA so'raladi — tahrirlashda qoldiq umuman yuborilmaydi */
  stock?: number;
  unit: string;
  description?: string;
}

/** Ombor to'g'irlash formasi: delta (musbat — kirim, manfiy — chiqim) */
interface StockFormValues {
  delta: number;
  reason?: string;
}

interface CategoryFormValues {
  name: string;
  description?: string;
}

const Products = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const currency = useCurrency();
  const canManage = hasRole('admin', 'superadmin');
  /** Ombor to'g'irlash kassirga ham ochiq — server POST /products/:id/stock ni
      shu rollarga ruxsat beradi (noto'g'ri sanoqni kassir o'zi tuzatadi) */
  const canAdjustStock = hasRole('admin', 'superadmin', 'kassir');

  // Mahsulotlar (server pagination)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined);

  // Kategoriyalar
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm] = Form.useForm<ProductFormValues>();
  const [savingProduct, setSavingProduct] = useState(false);

  // Ombor to'g'irlash (delta) — mahsulot tanlangan bo'lsa modal ochiq
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockForm] = Form.useForm<StockFormValues>();
  const [savingStock, setSavingStock] = useState(false);
  const stockDelta = Form.useWatch('delta', stockForm);

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
      setProductsLoaded(true);
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
      setCategoriesLoaded(true);
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

  /** Ombor to'g'irlash modalidagi jonli natija (server ham manfiyni rad etadi) */
  const nextStock = (stockProduct?.stock ?? 0) + (stockDelta ?? 0);

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
      unit: product.unit,
      description: product.description ?? undefined,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async () => {
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = await productForm.validateFields();
      setSavingProduct(true);
      // Tahrirlashda QOLDIQ yuborilmaydi: sahifa ochilgandan beri bo'lgan bar
      // sotuvlarini eski suratdagi qiymat bilan qaytarib yubormaslik uchun
      const payload = {
        categoryId: values.categoryId,
        name: values.name,
        price: values.price,
        unit: values.unit,
        description: values.description,
      };
      const res = editingProduct
        ? await productsApi.update(editingProduct.id, payload)
        : await productsApi.create({ ...payload, stock: values.stock ?? 0 });
      message.success(res.message);
      setProductModalOpen(false);
      void fetchProducts();
      void fetchCategories();
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingProduct(false);
    }
  };

  // ---------- Ombor to'g'irlash ----------
  const openAdjustStock = (product: Product) => {
    setStockProduct(product);
    stockForm.resetFields();
  };

  const handleAdjustStock = async () => {
    if (!stockProduct) return;
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = await stockForm.validateFields();
      setSavingStock(true);
      const res = await productsApi.adjustStock(
        stockProduct.id,
        values.delta,
        values.reason?.trim() || undefined,
      );
      message.success(res.message);
      setStockProduct(null);
      void fetchProducts();
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingStock(false);
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
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = await categoryForm.validateFields();
      setSavingCategory(true);
      const res = editingCategory
        ? await categoriesApi.update(editingCategory.id, values)
        : await categoriesApi.create(values);
      message.success(res.message);
      setCategoryModalOpen(false);
      void fetchCategories();
      void fetchProducts();
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(errorMessage(err, t('common.error')));
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
      render: (_, product) => <Tag>{product.category?.name ?? t('products.noCategory')}</Tag>,
    },
    {
      title: t('common.price'),
      dataIndex: 'price',
      width: 160,
      align: 'right',
      render: (price: number) => <MoneyText amount={price} currency={currency} />,
    },
    {
      title: t('products.stock'),
      dataIndex: 'stock',
      width: 150,
      render: (stock: number, product) => (
        <StatusTag
          status={stockStatus(stock)}
          label={`${formatNumber(stock)} ${unitLabel(product.unit)}`}
        />
      ),
    },
  ];
  // Amallar ustuni: tahrirlash/o'chirish — faqat admin, ombor to'g'irlash — kassir ham
  if (canManage || canAdjustStock) {
    productColumns.push({
      title: t('common.actions'),
      key: 'actions',
      width: canManage ? 150 : 80,
      render: (_, product) => (
        <Space size={4}>
          {canManage && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditProduct(product)} />
          )}
          {canAdjustStock && (
            <Tooltip title={t('products.adjustStock')}>
              <Button
                size="small"
                icon={<InboxOutlined />}
                aria-label={t('products.adjustStock')}
                onClick={() => openAdjustStock(product)}
              />
            </Tooltip>
          )}
          {canManage && (
            <Popconfirm
              title={t('common.confirmDelete')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => void handleDeleteProduct(product)}
            >
              <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
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
    <PageTransition>
      <PageHeader
        icon={<AppstoreOutlined />}
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void fetchProducts();
              void fetchCategories();
            }}
          >
            {t('btn.refresh')}
          </Button>
        }
      />

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
            children: !productsLoaded ? (
              <Card>
                <Skeleton active paragraph={{ rows: 6 }} />
              </Card>
            ) : (
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
                  size="middle"
                  sticky
                  columns={productColumns}
                  dataSource={products}
                  loading={productsLoading}
                  locale={{
                    emptyText: (
                      <EmptyState
                        icon={<CoffeeOutlined />}
                        title={t('products.emptyProducts')}
                        hint={t('products.emptyProductsHint')}
                        action={
                          canManage ? (
                            <Button
                              type="primary"
                              icon={<PlusOutlined />}
                              onClick={openCreateProduct}
                            >
                              {t('products.addProduct')}
                            </Button>
                          ) : undefined
                        }
                      />
                    ),
                  }}
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    position: ['bottomRight'],
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
            children: !categoriesLoaded ? (
              <Card>
                <Skeleton active paragraph={{ rows: 4 }} />
              </Card>
            ) : (
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
                  size="middle"
                  sticky
                  columns={categoryColumns}
                  dataSource={categories}
                  loading={categoriesLoading}
                  locale={{
                    emptyText: (
                      <EmptyState
                        icon={<TagsOutlined />}
                        title={t('products.emptyCategories')}
                        hint={t('products.emptyCategoriesHint')}
                        action={
                          canManage ? (
                            <Button
                              type="primary"
                              icon={<PlusOutlined />}
                              onClick={openCreateCategory}
                            >
                              {t('products.addCategory')}
                            </Button>
                          ) : undefined
                        }
                      />
                    ),
                  }}
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
            <Col span={editingProduct ? 24 : 12}>
              <Form.Item
                name="price"
                label={`${t('common.price')} (${currency})`}
                rules={[{ required: true, message: t('products.priceRequired') }]}
              >
                {/* Ming ajratkichi + valyuta belgisi — boshqa pul maydonlari
                    bilan bir xil (bitta ortiqcha nol darrov sezilsin) */}
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={1000}
                  addonAfter={currency}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                />
              </Form.Item>
            </Col>
            {/* Qoldiq faqat YARATISHDA kiritiladi — tahrirlashda u eski suratdagi
                qiymat bilan qaytib yozilib, bar sotuvlarini bekor qilib yubordi */}
            {!editingProduct && (
              <Col span={12}>
                <Form.Item
                  name="stock"
                  label={t('products.stock')}
                  rules={[{ required: true, message: t('products.stockRequired') }]}
                >
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} step={1} />
                </Form.Item>
              </Col>
            )}
          </Row>
          {editingProduct && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              {t('products.stockEditHint')}
            </Text>
          )}
          <Form.Item name="unit" label={t('products.unit')}>
            <Select options={UNITS.map((u) => ({ value: u, label: t(`products.unit_${u}`) }))} />
          </Form.Item>
          <Form.Item name="description" label={t('products.description')}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Ombor to'g'irlash — server delta ni atomar qo'llaydi (qator qulflanadi) */}
      <Modal
        title={t('products.adjustStockTitle', { name: stockProduct?.name ?? '' })}
        open={stockProduct !== null}
        onCancel={() => setStockProduct(null)}
        onOk={() => void handleAdjustStock()}
        confirmLoading={savingStock}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
      >
        <Form form={stockForm} layout="vertical">
          <Space size={20} wrap style={{ marginBottom: 12 }}>
            <Text type="secondary">
              {t('products.adjustStockCurrent')}:{' '}
              <Text strong>
                {formatNumber(stockProduct?.stock ?? 0)}{' '}
                {stockProduct ? unitLabel(stockProduct.unit) : ''}
              </Text>
            </Text>
            <Text type="secondary">
              {t('products.adjustStockNew')}:{' '}
              <Text strong type={nextStock < 0 ? 'danger' : undefined}>
                {formatNumber(nextStock)}
              </Text>
            </Text>
          </Space>
          <Form.Item
            name="delta"
            label={t('products.adjustStockDelta')}
            extra={t('products.adjustStockDeltaHint')}
            rules={[
              { required: true, message: t('products.adjustStockDeltaRequired') },
              {
                validator: (_, value: number | null) =>
                  value === 0
                    ? Promise.reject(new Error(t('products.adjustStockZero')))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber style={{ width: '100%' }} step={1} precision={0} />
          </Form.Item>
          <Form.Item name="reason" label={t('products.adjustStockReason')}>
            <Input maxLength={200} />
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
    </PageTransition>
  );
};

export default Products;
