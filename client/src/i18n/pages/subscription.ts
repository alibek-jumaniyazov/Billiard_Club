/**
 * Obuna sahifasi va umumiy tariflar/xarid oqimi (SubscriptionPlans
 * komponenti Locked ekranida ham shu kalitlardan foydalanadi).
 */
export default {
  uz: {
    pageTitle: 'Obuna',
    pageSubtitle: "Tarif, to'lovlar tarixi va obuna holati",
    adminOnly: 'Bu sahifa faqat klub egasi (admin) uchun',

    // Holat gerosi
    statusTitle: 'Obuna holati',
    daysLeft: 'Qolgan kunlar',
    daysValue: '{{days}} kun',
    unlimited: 'Cheklanmagan',
    endsAt: 'Amal qilish muddati',
    activePlan: 'Joriy tarif',
    trialPlan: 'Sinov davri',
    expiredNote: "Obuna muddati tugagan — quyidagi tariflardan birini tanlab uzaytiring.",
    statusLoadError: "Obuna holatini yuklab bo'lmadi",
    retry: 'Qayta urinish',

    // Tariflar katalogi
    plansTitle: 'Tariflar',
    plansSubtitle: "To'lov administrator tomonidan tasdiqlangach obuna avtomatik uzaytiriladi",
    noPlans: 'Faol tariflar topilmadi',
    noPlansHint: "Iltimos, birozdan so'ng qayta urinib ko'ring yoki administrator bilan bog'laning",
    plansLoadError: "Tariflarni yuklab bo'lmadi",
    'period.monthly': 'Oylik',
    'period.quarterly': 'Choraklik',
    'period.semiannual': '6 oylik',
    'period.yearly': 'Yillik',
    'period.custom': 'Maxsus',
    durationDays: '{{days}} kun',
    perDay: "≈ {{amount}} so'm/kun",
    save: '{{percent}}% tejamkor',
    bestValue: 'Eng foydali',
    current: 'Joriy',
    select: 'Tanlash',
    pendingBlocksNew: "Avval kutilayotgan to'lov so'rovini yakunlang yoki bekor qiling",

    // Xarid oynasi
    purchaseTitle: "To'lov so'rovi",
    couponLabel: 'Kupon kodi',
    couponOptional: 'ixtiyoriy',
    couponPlaceholder: "Chegirma kuponingiz bo'lsa kiriting",
    submitPurchase: "So'rov yuborish",
    purchaseHint:
      "So'rov yuborilgach administrator to'lovni tekshirib tasdiqlaydi — obunangiz darhol faollashadi.",

    // Kutilayotgan faktura banneri
    pendingTitle: "To'lov tasdiqlanishi kutilmoqda",
    pendingExplainer:
      "Administrator to'lovni tasdiqlashi bilan obuna avtomatik uzaytiriladi. Holat shu sahifada yangilanadi.",
    invoiceLabel: 'Faktura',
    discountLabel: 'Chegirma',
    cancelRequest: "So'rovni bekor qilish",
    cancelConfirm: "To'lov so'rovi bekor qilinsinmi?",

    // Fakturalar tarixi
    invoicesTitle: "To'lovlar tarixi",
    invoicesEmpty: "Hozircha to'lovlar yo'q",
    invoicesEmptyHint: "Tarif tanlab birinchi to'lov so'rovingizni yuboring",
    invoicesLoadError: "To'lovlar tarixini yuklab bo'lmadi",
    colNumber: 'Raqam',
    colPlan: 'Tarif',
    colAmount: 'Summa',
    colStatus: 'Holat',
    colCreated: 'Yaratilgan',
    colPaid: "To'lov",
    'status.pending': 'Kutilmoqda',
    'status.paid': "To'langan",
    'status.cancelled': 'Bekor qilingan',
    'status.expired': "Muddati o'tgan",
  },
  ru: {
    pageTitle: 'Подписка',
    pageSubtitle: 'Тариф, история платежей и статус подписки',
    adminOnly: 'Эта страница доступна только владельцу клуба (админу)',

    // Статус
    statusTitle: 'Статус подписки',
    daysLeft: 'Осталось дней',
    daysValue: '{{days}} дн.',
    unlimited: 'Не ограничено',
    endsAt: 'Действует до',
    activePlan: 'Текущий тариф',
    trialPlan: 'Пробный период',
    expiredNote: 'Срок подписки истёк — выберите один из тарифов ниже, чтобы продлить.',
    statusLoadError: 'Не удалось загрузить статус подписки',
    retry: 'Повторить',

    // Каталог тарифов
    plansTitle: 'Тарифы',
    plansSubtitle: 'После подтверждения оплаты администратором подписка продлевается автоматически',
    noPlans: 'Активные тарифы не найдены',
    noPlansHint: 'Попробуйте позже или свяжитесь с администратором',
    plansLoadError: 'Не удалось загрузить тарифы',
    'period.monthly': 'Месячный',
    'period.quarterly': 'Квартальный',
    'period.semiannual': 'Полугодовой',
    'period.yearly': 'Годовой',
    'period.custom': 'Особый',
    durationDays: '{{days}} дней',
    perDay: '≈ {{amount}} сум/день',
    save: 'Выгода {{percent}}%',
    bestValue: 'Самый выгодный',
    current: 'Текущий',
    select: 'Выбрать',
    pendingBlocksNew: 'Сначала завершите или отмените ожидающую заявку на оплату',

    // Окно покупки
    purchaseTitle: 'Заявка на оплату',
    couponLabel: 'Промокод',
    couponOptional: 'необязательно',
    couponPlaceholder: 'Введите промокод, если он у вас есть',
    submitPurchase: 'Отправить заявку',
    purchaseHint:
      'После отправки заявки администратор проверит и подтвердит оплату — подписка активируется сразу.',

    // Баннер ожидающего счёта
    pendingTitle: 'Платёж ожидает подтверждения',
    pendingExplainer:
      'Как только администратор подтвердит оплату, подписка продлится автоматически. Статус обновится на этой странице.',
    invoiceLabel: 'Счёт',
    discountLabel: 'Скидка',
    cancelRequest: 'Отменить заявку',
    cancelConfirm: 'Отменить заявку на оплату?',

    // История счетов
    invoicesTitle: 'История платежей',
    invoicesEmpty: 'Платежей пока нет',
    invoicesEmptyHint: 'Выберите тариф и отправьте первую заявку на оплату',
    invoicesLoadError: 'Не удалось загрузить историю платежей',
    colNumber: 'Номер',
    colPlan: 'Тариф',
    colAmount: 'Сумма',
    colStatus: 'Статус',
    colCreated: 'Создан',
    colPaid: 'Оплата',
    'status.pending': 'Ожидает',
    'status.paid': 'Оплачен',
    'status.cancelled': 'Отменён',
    'status.expired': 'Просрочен',
  },
};
