/**
 * `UPDATE/DELETE ... RETURNING` natijasining QATORLARI.
 *
 * TypeORM ning PostgreSQL drayveri `dataSource.query()` / `manager.query()` da
 * UPDATE va DELETE uchun qatorlarni emas, `[rows, rowCount]` juftligini
 * qaytaradi (INSERT va SELECT uchun esa oddiy `rows`). Natijani to'g'ridan-to'g'ri
 * qatorlar deb o'qish ikki xil jim xatoga olib kelgan edi:
 *   - `result.length` har doim 2 — "hech narsa yangilanmadi" holati ko'rinmaydi;
 *   - `result.map(...)` juftlikning o'zini (massiv va son) "qator" deb oladi.
 *
 * Bu yordamchi ikkala shaklni ham qabul qiladi va har doim qatorlar massivini
 * qaytaradi — drayver xatti-harakati o'zgarsa ham kod buzilmaydi.
 */
export const returningRows = <T>(result: unknown): T[] => {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
};
