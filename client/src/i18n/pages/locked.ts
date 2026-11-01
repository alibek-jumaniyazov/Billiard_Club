/** Obuna blok ekrani — tariflar/xarid matnlari subscription.* dan olinadi */
export default {
  uz: {
    docTitle: 'Obuna — Billiard Club',
    expiredTitle: 'Obuna muddati tugagan',
    expiredDesc:
      "Klubingizning obuna muddati tugadi. Quyidagi tariflardan birini tanlab obunani darhol uzaytirishingiz mumkin.",
    blockedTitle: 'Klub bloklangan',
    blockedDesc: "Klubingiz vaqtincha bloklangan. Administrator bilan bog'laning.",
    // Blok sababi: superadmin tayyor ro'yxatdan tanlaydi (admin panelidagi tanlov ham shu matnlar)
    reasonLabel: 'Sabab',
    'reason.free_plan_abuse': "Bepul tarifdan noto'g'ri foydalanish",
    'reasonDesc.free_plan_abuse':
      "Bitta klub uchun 2 yoki undan ortiq hisob ochilgan. Bepul sinov muddati har bir klubga faqat bir marta beriladi. Yangi hisob ochish o'rniga obuna sotib oling — to'lov tasdiqlangach klubingiz blokdan chiqariladi.",
    'reason.unpaid': "To'lov qilinmagan",
    'reasonDesc.unpaid':
      "Kelishilgan to'lov o'z vaqtida amalga oshirilmagan. Obunani to'lang — to'lov tasdiqlangach klubingiz blokdan chiqariladi.",
    'reason.rules_violation': 'Foydalanish shartlari buzilgan',
    'reasonDesc.rules_violation':
      "Hisob foydalanish shartlariga zid ishlatilgan. Batafsil ma'lumot va blokdan chiqarish uchun administrator bilan bog'laning.",
    'reason.suspicious_activity': 'Shubhali faollik',
    'reasonDesc.suspicious_activity':
      "Hisobingizda shubhali harakatlar aniqlandi va xavfsizlik uchun u vaqtincha bloklandi. Administrator bilan bog'laning.",
    'reason.owner_request': "Klub egasining so'rovi",
    'reasonDesc.owner_request':
      "Hisob klub egasining so'roviga ko'ra vaqtincha to'xtatilgan. Qayta ochish uchun administrator bilan bog'laning.",
    'reason.other': 'Boshqa sabab',
    'reasonDesc.other':
      "Klubingiz administrator qarori bilan bloklangan. Batafsil ma'lumot uchun administrator bilan bog'laning.",
    adminNote: 'Administrator izohi',
    blockedAt: 'Bloklangan sana',
    trialEnded: 'Sinov muddati tugadi',
    trialEndedDesc:
      "7 kunlik bepul sinov yakunlandi. Ishni davom ettirish uchun quyidagi tariflardan birini tanlang.",
    endedAt: 'Tugagan sana',
    dataSafeTitle: "Ma'lumotlaringiz xavfsiz",
    dataSafeDesc:
      "Stollar, sessiyalar, hisobotlar — barchasi saqlanib qolgan. Obuna faollashishi bilan hammasi joyida davom etadi.",
    staffContactAdmin:
      "Obunani faqat klub egasi (admin) uzaytira oladi. Iltimos, klub rahbariga murojaat qiling.",
    contact: "Bog'lanish",
    telegram: "Telegram orqali bog'lanish",
    recheck: 'Holatni tekshirish',
    stillLocked: 'Obuna hali ham faol emas',
    nowActive: "Obuna faollashdi! Tizimga yo'naltirilmoqda...",
    backHome: 'Bosh sahifa',
  },
  ru: {
    docTitle: 'Подписка — Billiard Club',
    expiredTitle: 'Срок подписки истёк',
    expiredDesc:
      'Срок подписки вашего клуба истёк. Выберите один из тарифов ниже, чтобы продлить её прямо сейчас.',
    blockedTitle: 'Клуб заблокирован',
    blockedDesc: 'Ваш клуб временно заблокирован. Свяжитесь с администратором.',
    reasonLabel: 'Причина',
    'reason.free_plan_abuse': 'Злоупотребление бесплатным тарифом',
    'reasonDesc.free_plan_abuse':
      'Для одного клуба открыто 2 и более аккаунта. Бесплатный пробный период предоставляется каждому клубу только один раз. Вместо нового аккаунта оформите подписку — после подтверждения оплаты клуб будет разблокирован.',
    'reason.unpaid': 'Оплата не поступила',
    'reasonDesc.unpaid':
      'Согласованная оплата не поступила вовремя. Оплатите подписку — после подтверждения оплаты клуб будет разблокирован.',
    'reason.rules_violation': 'Нарушение условий использования',
    'reasonDesc.rules_violation':
      'Аккаунт использовался в нарушение условий. За подробностями и разблокировкой обратитесь к администратору.',
    'reason.suspicious_activity': 'Подозрительная активность',
    'reasonDesc.suspicious_activity':
      'В аккаунте обнаружены подозрительные действия, и в целях безопасности он временно заблокирован. Свяжитесь с администратором.',
    'reason.owner_request': 'По просьбе владельца клуба',
    'reasonDesc.owner_request':
      'Аккаунт временно приостановлен по просьбе владельца клуба. Чтобы возобновить работу, свяжитесь с администратором.',
    'reason.other': 'Другая причина',
    'reasonDesc.other':
      'Клуб заблокирован решением администратора. За подробностями обратитесь к администратору.',
    adminNote: 'Комментарий администратора',
    blockedAt: 'Дата блокировки',
    trialEnded: 'Пробный период завершён',
    trialEndedDesc:
      'Бесплатный 7-дневный период завершён. Выберите один из тарифов ниже, чтобы продолжить работу.',
    endedAt: 'Дата окончания',
    dataSafeTitle: 'Ваши данные в безопасности',
    dataSafeDesc:
      'Столы, сессии, отчёты — всё сохранено. Как только подписка активируется, работа продолжится с того же места.',
    staffContactAdmin:
      'Продлить подписку может только владелец клуба (админ). Пожалуйста, обратитесь к руководителю клуба.',
    contact: 'Связаться',
    telegram: 'Связаться через Telegram',
    recheck: 'Проверить статус',
    stillLocked: 'Подписка всё ещё неактивна',
    nowActive: 'Подписка активирована! Выполняется переход...',
    backHome: 'На главную',
  },
};
