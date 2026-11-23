export default {
  uz: {
    title: 'Klub sozlamalari',
    subtitle: "Klub ma'lumotlari va standart sozlamalarni boshqarish",
    // Klub ma'lumotlari
    clubInfo: "Klub ma'lumotlari",
    clubName: 'Klub nomi',
    clubNameRequired: 'Klub nomini kiriting',
    address: 'Manzil',
    // Valyuta va narx
    pricing: 'Valyuta va narx',
    currency: 'Valyuta',
    currencySymbol: 'Valyuta belgisi',
    defaultTablePrice: 'Standart soatlik narx',
    priceRequired: 'Standart narxni kiriting',
    // Hisob-kitob: stolda yig'ilgan pulni yaxlitlash
    billing: 'Hisob-kitob',
    tableRounding: "Stolda yig'ilgan pulni yaxlitlash",
    tableRoundingHint:
      "Stol vaqti avvalgidek sekundigacha aniq hisoblanadi. Yoqilganda stol summasi eng yaqin yaxlit summaga yaxlitlanadi: kartada, kassa oynasida, chekda va kassaga aynan yaxlit summa tushadi.",
    tableRoundingStep: 'Yaxlitlash aniqligi',
    tableRoundingExample: 'Misol',
    tableRoundingNoteBar: "Bar (buyurtmalar) summasi yaxlitlanmaydi — mahsulot narxlari o'zgarmaydi.",
    tableRoundingNoteLive:
      "Saqlangach davom etayotgan o'yinlarga ham darhol qo'llanadi; yakunlangan o'yinlar o'zgarmaydi.",
    tableRoundingNoteAudit:
      "Aniq summa va yaxlitlash farqi chekda, o'yinlar tarixida va hisobotlarda ko'rinadi.",
    // Vaqt mintaqasi
    regional: 'Mintaqaviy sozlamalar',
    timezone: 'Vaqt mintaqasi',
    timezoneHint:
      "Kunlik hisobot va statistika chegaralari («bugun», «hafta», «oy») shu mintaqa bo'yicha hisoblanadi",
    // Ish vaqti
    workingHours: 'Ish vaqti',
    workingHoursNote:
      "Ish vaqti faqat ma'lumot sifatida saqlanadi — tizim ishlashini cheklamaydi.",
    openTime: 'Ochilish vaqti',
    closeTime: 'Yopilish vaqti',
    // Yuklash xatosi
    loadErrorTitle: "Sozlamalarni yuklab bo'lmadi",
    loadErrorHint: "Server bilan aloqa yo'q yoki vaqtinchalik uzilish. Qayta urinib ko'ring.",
  },
  ru: {
    title: 'Настройки клуба',
    subtitle: 'Управление данными клуба и настройками по умолчанию',
    // Данные клуба
    clubInfo: 'Данные клуба',
    clubName: 'Название клуба',
    clubNameRequired: 'Введите название клуба',
    address: 'Адрес',
    // Валюта и цены
    pricing: 'Валюта и цены',
    currency: 'Валюта',
    currencySymbol: 'Символ валюты',
    defaultTablePrice: 'Стандартная цена за час',
    priceRequired: 'Введите стандартную цену',
    // Расчёт: округление суммы за стол
    billing: 'Расчёт',
    tableRounding: 'Округлять сумму за стол',
    tableRoundingHint:
      'Время за столом по-прежнему считается с точностью до секунды. Когда включено, сумма за стол округляется до ближайшей круглой суммы: на карточке, в окне кассы, в чеке и в кассу попадает именно круглая сумма.',
    tableRoundingStep: 'Точность округления',
    tableRoundingExample: 'Пример',
    tableRoundingNoteBar: 'Сумма бара (заказы) не округляется — цены товаров не меняются.',
    tableRoundingNoteLive:
      'После сохранения сразу применяется и к идущим играм; завершённые игры не меняются.',
    tableRoundingNoteAudit:
      'Точная сумма и разница округления видны в чеке, в истории игр и в отчётах.',
    // Часовой пояс
    regional: 'Региональные настройки',
    timezone: 'Часовой пояс',
    timezoneHint:
      'Границы дневных отчётов и статистики («сегодня», «неделя», «месяц») рассчитываются по этому поясу',
    // Время работы
    workingHours: 'Время работы',
    workingHoursNote:
      'Время работы носит информационный характер и не ограничивает работу системы.',
    openTime: 'Время открытия',
    closeTime: 'Время закрытия',
    // Ошибка загрузки
    loadErrorTitle: 'Не удалось загрузить настройки',
    loadErrorHint: 'Нет связи с сервером или временный сбой. Попробуйте ещё раз.',
  },
};
