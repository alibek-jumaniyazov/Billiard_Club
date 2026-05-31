import api from './axios';

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

export const tablesApi = {
  getAll: (params) => api.get('/tables', { params }),
  getOne: (id) => api.get(`/tables/${id}`),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
};

export const sessionsApi = {
  getAll: (params) => api.get('/sessions', { params }),
  getOne: (id) => api.get(`/sessions/${id}`),
  start: (data) => api.post('/sessions/start', data),
  end: (id, data) => api.put(`/sessions/${id}/end`, data),
};

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

export const productsApi = {
  getAll: (params) => api.get('/products', { params }),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

export const ordersApi = {
  getAll: (params) => api.get('/orders', { params }),
  create: (data) => api.post('/orders', data),
  close: (id) => api.put(`/orders/${id}/close`),
};

export const reportsApi = {
  getReport: (type, params) => api.get(`/reports/${type}`, { params }),
  exportReport: (format, params) => api.get(`/reports/export/${format}`, { params, responseType: 'blob' }),
};

export const staffApi = {
  getAll: (params) => api.get('/staff', { params }),
  create: (data) => api.post('/staff', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  delete: (id) => api.delete(`/staff/${id}`),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

export const debtsApi = {
  getAll: (params) => api.get('/debts', { params }),
  pay: (id, amount) => api.post(`/debts/${id}/pay`, { amount }),
  delete: (id) => api.delete(`/debts/${id}`),
};
