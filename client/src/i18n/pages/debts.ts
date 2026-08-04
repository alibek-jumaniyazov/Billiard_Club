export default {
  uz: {
    title: 'Qarzlar daftari',
    subtitle: 'Mijozlar qarzlarini kuzatish va undirish',
    // Statistika kartalari (server bergan to'liq filtr yig'indilari)
    statRemaining: 'Undirilishi kerak (jami)',
    statTotal: 'Umumiy qarz (jami)',
    // Qidiruv
    searchPlaceholder: "Mijoz ismi yoki telefoni bo'yicha qidirish",
    // Jadval ustunlari
    noPhone: "Telefon ko'rsatilmagan",
    totalDebtCol: 'Jami qarz',
    paidAmountCol: "To'langan",
    remainingCol: 'Qolgan qarz',
    status: 'Holat',
    // To'lov oynasi
    pay: 'Qarzni uzish',
    payTitle: 'Qarzni uzish',
    remainingLabel: 'Qolgan qarz',
    amountLabel: "To'lov summasi",
    amountRequired: "To'lov summasini kiriting",
    amountInvalid: "Summa 0 dan katta va qolgan qarzdan oshmasligi kerak",
    methodRequired: "To'lov usulini tanlang",
    payFull: "To'liq to'lash",
    acceptPayment: "To'lovni qabul qilish",
    // Hisobdan chiqarish
    writeOffTitle: 'Qarzni hisobdan chiqarish',
    writeOffConfirm: 'Hisobdan chiqarish',
    writeOffWarning:
      "Qarz yozuvi butunlay o'chiriladi va uni QAYTARIB BO'LMAYDI. Qoldiq summa hech qachon undirilmagan hisoblanadi.",
    writtenOff: 'Hisobdan chiqarilgan',
    writeOffReasonLabel: 'Sabab (majburiy)',
    writeOffReasonPlaceholder: "Masalan: mijoz topilmadi, summa juda kichik, kelishuv bo'yicha kechirildi",
    writeOffReasonRequired: 'Hisobdan chiqarish sababini yozing',
    // To'lovlar tarixi
    historyTitle: "To'lovlar tarixi",
    amount: 'Summa',
    receivedBy: 'Kim qabul qilgan',
    historyEmpty: "To'lovlar hali yo'q",
    // Bo'sh holat
    emptyTitle: "Qarzlar yo'q",
    emptyHint: "Bu filtr bo'yicha qarz yozuvlari topilmadi",
  },
  ru: {
    title: 'Книга долгов',
    subtitle: 'Учёт и взыскание долгов клиентов',
    // Карточки статистики (итоги по всему фильтру с сервера)
    statRemaining: 'К взысканию (итого)',
    statTotal: 'Общая сумма долга (итого)',
    // Поиск
    searchPlaceholder: 'Поиск по имени или телефону клиента',
    // Колонки таблицы
    noPhone: 'Телефон не указан',
    totalDebtCol: 'Сумма долга',
    paidAmountCol: 'Оплачено',
    remainingCol: 'Остаток долга',
    status: 'Статус',
    // Окно оплаты
    pay: 'Погасить',
    payTitle: 'Погашение долга',
    remainingLabel: 'Остаток долга',
    amountLabel: 'Сумма оплаты',
    amountRequired: 'Введите сумму оплаты',
    amountInvalid: 'Сумма должна быть больше 0 и не превышать остаток долга',
    methodRequired: 'Выберите способ оплаты',
    payFull: 'Оплатить полностью',
    acceptPayment: 'Принять оплату',
    // Списание долга
    writeOffTitle: 'Списание долга',
    writeOffConfirm: 'Списать',
    writeOffWarning:
      'Запись о долге будет удалена безвозвратно. Остаток суммы будет считаться так и не взысканным.',
    writtenOff: 'Списан',
    writeOffReasonLabel: 'Причина (обязательно)',
    writeOffReasonPlaceholder: 'Например: клиент не найден, сумма незначительна, прощено по договорённости',
    writeOffReasonRequired: 'Укажите причину списания',
    // История платежей
    historyTitle: 'История платежей',
    amount: 'Сумма',
    receivedBy: 'Кто принял',
    historyEmpty: 'Платежей пока нет',
    // Пустое состояние
    emptyTitle: 'Долгов нет',
    emptyHint: 'По этому фильтру долговых записей не найдено',
  },
};
