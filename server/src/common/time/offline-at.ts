/**
 * OFLAYN VAQT MUHRI — klientning oflayn navbatidan kelgan amal vaqtini
 * (`offlineAt`) xavfsiz oraliqqa keltirish.
 *
 * Kassa internetsiz paytda bajarilgan amalni (o'yin boshlash, pauza, bar
 * buyurtmasi, ko'chirish, bekor qilish, hisob-kitob) aloqa tiklangach
 * yuboradi va uning HAQIQIY vaqtini `offlineAt` da beradi. Qiymat klientdan
 * keladi, shuning uchun unga ko'r-ko'rona ishonilmaydi:
 *  - kelajakdagi vaqt — hozirgi vaqtga kesiladi (kelajakka yozib bo'lmaydi);
 *  - 24 soatdan eski vaqt — chegaraga kesiladi: oflayn navbat bir smenadan
 *    uzoq kutmaydi, undan eskisi xato yoki suiiste'mol belgisi;
 *  - `floor` berilsa (masalan sessiya yoki joriy segment boshlanishi) —
 *    undan oldingi vaqt shu chegaraga ko'tariladi (manfiy davomiylik yo'q);
 *  - berilmagan yoki buzuq bo'lsa — hozirgi vaqt ishlatiladi.
 *
 * Bitta funksiya sessiyalar VA bar buyurtmalari uchun ishlatiladi. U HECH
 * QACHON rad etmaydi, faqat kesadi: o'yin yoki ichimlik allaqachon sotilgan —
 * rad javobi pul yozuvini yo'qotardi. Kesilgan holat chaqiruvchida audit
 * jurnaliga yoziladi.
 *
 * Qarz to'lovi, bron, mijoz va smena amallari esa qat'iyroq qoidani
 * ishlatadi (common/offline/offline-at.ts: resolveOfflineAt — kelajak va
 * juda eski muhrni aniq xabar bilan RAD ETADI). Farq ataylab.
 */

/** Oflayn navbatdagi amal eng ko'pi bilan shuncha orqaga yozilishi mumkin */
export const OFFLINE_MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;

/**
 * @returns [qo'llangan vaqt, kesilganmi] — kesilgan holat chaqiruvchida audit
 *   jurnaliga yoziladi (pulga ta'sir qiladi, iz qolishi shart)
 */
export function clampOfflineAt(
  raw: string | undefined,
  floor?: Date | string | null,
  now: Date = new Date(),
): [Date, boolean] {
  if (!raw) return [now, false];

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return [now, true];

  const earliest = Math.max(
    now.getTime() - OFFLINE_MAX_BACKDATE_MS,
    floor ? new Date(floor).getTime() : 0,
  );
  // Chegara "hozir" dan keyin bo'lsa ham (masalan segment soniya ichida ochilgan)
  // natija hech qachon kelajakka chiqmaydi
  const clamped = Math.min(Math.max(parsed, earliest), now.getTime());
  return [new Date(clamped), clamped !== parsed];
}
