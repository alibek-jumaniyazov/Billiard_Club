export default {
  uz: {
    title: 'Mijozlar',
    subtitle: "Doimiy mijozlar bazasi va ularning tarixi",
    searchPlaceholder: "Ism yoki telefon bo'yicha qidirish",
    totalCount: 'Jami mijozlar',
    // Jadval
    noPhone: "Telefon ko'rsatilmagan",
    registeredAt: "Qo'shilgan sana",
    view: 'Profil',
    // Yaratish / tahrirlash
    addCustomer: "Mijoz qo'shish",
    editCustomer: 'Mijozni tahrirlash',
    nameLabel: 'Ism',
    nameRequired: 'Mijoz ismini kiriting',
    phoneLabel: 'Telefon',
    phonePlaceholder: '+998 90 123 45 67',
    notesLabel: 'Izoh',
    notesPlaceholder: "Mijoz haqida qo'shimcha ma'lumot",
    // Profil (detal)
    detailTitle: 'Mijoz profili',
    statSessions: "O'yinlar soni",
    statSpent: 'Jami xarajati',
    statOpenDebt: 'Ochiq qarzi',
    recentSessions: "So'nggi o'yinlar",
    statusCol: 'Holat',
    noSessions: "Hali o'yinlar yo'q",
    noSessionsHint: "Bu mijoz nomiga yozilgan sessiyalar shu yerda ko'rinadi",
    // O'chirish
    deleteGuardHint: "Ochiq qarzi bor mijozni o'chirib bo'lmaydi",
    // Bo'sh holat
    emptyTitle: "Mijozlar ro'yxati bo'sh",
    emptyHint: "Birinchi mijozni qo'shing — sessiyalar va qarzlar unga bog'lanadi",
    emptySearchTitle: 'Hech narsa topilmadi',
    emptySearchHint: "Qidiruv so'zini o'zgartirib ko'ring",
    // Oflayn (internetsiz) qo'shish
    offlineCreate: '{{name}} — yangi mijoz',
    offlinePending: 'Yuborilmagan',
    offlinePendingHint:
      'Internetsiz qo‘shildi — aloqa tiklanganda yuboriladi. Bu telefon raqami bilan mijoz allaqachon bo‘lsa, yozuv o‘sha mijozga birlashtiriladi.',
    offlineFailed: 'Qabul qilinmadi',
    offlineFailedHint: 'Server rad etdi: {{reason}}. «Yuborilmagan amallar» oynasida hal qiling.',
    offlineEditBlocked: 'Mijozni tahrirlash va o‘chirish uchun internet kerak',
    offlineLocalBlocked: 'Mijoz hali serverga yuborilmagan — profil aloqa tiklangach ochiladi',
  },
  ru: {
    title: 'Клиенты',
    subtitle: 'База постоянных клиентов и их история',
    searchPlaceholder: 'Поиск по имени или телефону',
    totalCount: 'Всего клиентов',
    // Таблица
    noPhone: 'Телефон не указан',
    registeredAt: 'Дата добавления',
    view: 'Профиль',
    // Создание / редактирование
    addCustomer: 'Добавить клиента',
    editCustomer: 'Редактировать клиента',
    nameLabel: 'Имя',
    nameRequired: 'Введите имя клиента',
    phoneLabel: 'Телефон',
    phonePlaceholder: '+998 90 123 45 67',
    notesLabel: 'Комментарий',
    notesPlaceholder: 'Дополнительная информация о клиенте',
    // Профиль (деталь)
    detailTitle: 'Профиль клиента',
    statSessions: 'Количество игр',
    statSpent: 'Всего потрачено',
    statOpenDebt: 'Открытый долг',
    recentSessions: 'Последние игры',
    statusCol: 'Статус',
    noSessions: 'Игр пока нет',
    noSessionsHint: 'Сессии, записанные на этого клиента, появятся здесь',
    // Удаление
    deleteGuardHint: 'Клиента с открытым долгом удалить нельзя',
    // Пустое состояние
    emptyTitle: 'Список клиентов пуст',
    emptyHint: 'Добавьте первого клиента — сессии и долги будут привязаны к нему',
    emptySearchTitle: 'Ничего не найдено',
    emptySearchHint: 'Попробуйте изменить поисковый запрос',
    // Офлайн-добавление (без интернета)
    offlineCreate: '{{name}} — новый клиент',
    offlinePending: 'Не отправлено',
    offlinePendingHint:
      'Добавлен без интернета — будет отправлен при восстановлении связи. Если клиент с этим телефоном уже есть, запись будет объединена с ним.',
    offlineFailed: 'Не принято',
    offlineFailedHint: 'Сервер отклонил: {{reason}}. Решите в окне «Неотправленные действия».',
    offlineEditBlocked: 'Для редактирования и удаления клиента нужен интернет',
    offlineLocalBlocked: 'Клиент ещё не отправлен на сервер — профиль откроется после восстановления связи',
  },
};
