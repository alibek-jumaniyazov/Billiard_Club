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
    // Oflayn (internetsiz) to'lov
    offlinePay: '{{name}} — qarz to‘lovi {{amount}}',
    offlineSaved: 'To‘lov saqlandi — aloqa tiklanganda serverga yuboriladi',
    queuedBehind: 'To‘lov navbatga qo‘shildi — shu mijozning oldingi to‘lovlari yuborilgach serverga ketadi',
    offlinePending: 'Yuborilmagan',
    offlinePendingHint:
      'Internetsiz qabul qilingan to‘lov ({{amount}}) qoldiqdan ayirildi. Aloqa tiklanganda u qabul qilingan vaqti bilan serverga yuboriladi.',
    offlineFailed: 'Qabul qilinmadi',
    offlineFailedHint:
      'Internetsiz qabul qilingan to‘lovni server qabul qilmadi — «Yuborilmagan amallar» oynasida sababini ko‘rib, hal qiling. Bu summa qoldiqdan ayirilmagan.',
    offlineTotalsHint: 'Yuborilmagan to‘lovlar ({{amount}}) ayirib ko‘rsatildi',
    offlineHistoryTitle: 'Yuborilmagan to‘lovlar',
    offlineHistoryUnavailable: 'To‘lovlar tarixi internetsiz yuklanmaydi — quyida faqat shu kassadagi yuborilmagan to‘lovlar.',
    writeOffOffline: 'Qarzni hisobdan chiqarish uchun internet kerak',
    writeOffPending: 'Bu qarz bo‘yicha yuborilmagan to‘lov bor — avval u serverga yetib borsin',
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
    // Офлайн-оплата (без интернета)
    offlinePay: '{{name}} — оплата долга {{amount}}',
    offlineSaved: 'Оплата сохранена — будет отправлена на сервер при восстановлении связи',
    queuedBehind: 'Оплата добавлена в очередь — уйдёт на сервер после предыдущих оплат этого клиента',
    offlinePending: 'Не отправлено',
    offlinePendingHint:
      'Оплата, принятая без интернета ({{amount}}), вычтена из остатка. При восстановлении связи она будет отправлена на сервер со временем приёма.',
    offlineFailed: 'Не принято',
    offlineFailedHint:
      'Сервер не принял оплату, проведённую без интернета, — посмотрите причину в окне «Неотправленные действия». Эта сумма не вычтена из остатка.',
    offlineTotalsHint: 'Неотправленные оплаты ({{amount}}) уже вычтены',
    offlineHistoryTitle: 'Неотправленные оплаты',
    offlineHistoryUnavailable: 'История платежей без интернета не загружается — ниже только неотправленные оплаты этой кассы.',
    writeOffOffline: 'Для списания долга нужен интернет',
    writeOffPending: 'По этому долгу есть неотправленная оплата — дождитесь её отправки на сервер',
  },
};
