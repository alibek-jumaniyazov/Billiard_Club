/** Antd forma xatolari bilan ishlash — modal/drawer onOk oqimlari uchun */

/**
 * `form.validateFields()` rad javobimi? Antd bunday holatda `errorFields`
 * massivi bo'lgan obyekt qaytaradi — xatolar allaqachon maydon ostida
 * ko'rinadi, shuning uchun qo'shimcha toast chiqarilmaydi.
 */
export const isFormValidationError = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  Array.isArray((err as { errorFields?: unknown }).errorFields);
