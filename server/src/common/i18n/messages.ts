import { Language } from '../decorators/lang.decorator';

/**
 * Server javob xabarlari katalogi (uz/ru).
 * Kalit topilmasa — uz varianti, u ham bo'lmasa kalitning o'zi qaytadi.
 * {param} ko'rinishidagi joylar t() chaqiruvida almashtiriladi.
 */
const messages: Record<Language, Record<string, string>> = {
  uz: {
    // Auth
    'auth.credentialsRequired': 'Username va parol talab qilinadi',
    'auth.invalidCredentials': "Username yoki parol noto'g'ri",
    'auth.loginSuccess': 'Muvaffaqiyatli kirildi',
    'auth.refreshRequired': 'Refresh token talab qilinadi',
    'auth.invalidToken': 'Token yaroqsiz',
    'auth.tokenExpired': 'Token muddati tugagan',
    'auth.notAuthenticated': 'Autentifikatsiya talab qilinadi',
    'auth.userNotFoundOrBlocked': 'Foydalanuvchi topilmadi yoki bloklangan',
    'auth.logoutSuccess': 'Muvaffaqiyatli chiqildi',
    'auth.forbidden': "Bu amalni bajarish uchun ruxsat yo'q",

    // Obuna
    'subscription.clubNotFound': 'Klub topilmadi',
    'subscription.clubBlocked': 'Klub bloklangan. Administrator bilan bog\'laning',
    'subscription.expired': "Obuna muddati tugagan. Administrator bilan bog'laning",
    'subscription.clubContextRequired': 'Klub konteksti talab qilinadi',

    // Stollar
    'tables.notFound': 'Stol topilmadi',
    'tables.created': "Stol qo'shildi",
    'tables.updated': 'Stol yangilandi',
    'tables.deleted': "Stol o'chirildi",
    'tables.hasActiveSession': "Stolda faol o'yin bor, o'chirib bo'lmaydi",
    'tables.numberTaken': 'Bu raqamli stol allaqachon mavjud',

    // Sessiyalar
    'sessions.notFound': 'Sessiya topilmadi',
    'sessions.tableBusy': "Bu stolda faol o'yin bor. Avval uni yakunlang",
    'sessions.started': "O'yin boshlandi",
    'sessions.ended': "O'yin yakunlandi",
    'sessions.endedWithDebt': "O'yin yakunlandi va qarzga yozildi",
    'sessions.alreadyEnded': 'Sessiya allaqachon tugagan',
    'sessions.onlyActivePausable': 'Faqat faol sessiyani pauzaga olish mumkin',
    'sessions.notPaused': 'Sessiya pauzada emas',
    'sessions.paused': "O'yin pauzaga olindi",
    'sessions.resumed': "O'yin davom ettirildi",
    'sessions.cancelled': 'Sessiya bekor qilindi',
    'sessions.onlyActiveCancellable': 'Faqat faol yoki pauzadagi sessiyani bekor qilish mumkin',
    'sessions.debtNeedsCustomer': 'Qarzga yozish uchun mijoz ismi kiritilishi shart',
    'sessions.debtNeedsComponent': 'Qarzga yozish uchun Stol yoki Bar ni belgilang',
    'sessions.invalidDiscount': "Chegirma noto'g'ri: 0 dan katta va umumiy summadan oshmasligi kerak",

    // Buyurtmalar
    'orders.itemsRequired': 'Buyurtma elementlari talab qilinadi',
    'orders.sessionNotActive': 'Sessiya topilmadi yoki faol emas',
    'orders.productNotFound': 'Mahsulot topilmadi: {name}',
    'orders.insufficientStock': "'{name}' omborda yetarli emas (qoldiq: {stock})",
    'orders.created': "Buyurtma qo'shildi",

    // Qarzlar
    'debts.notFound': 'Qarz topilmadi',
    'debts.alreadyPaid': "Bu qarz allaqachon to'langan",
    'debts.invalidAmount': "To'lov summasi noto'g'ri",
    'debts.amountExceedsRemaining': "To'lov qolgan qarzdan ({remaining}) oshib ketdi",
    'debts.paymentAccepted': "To'lov qabul qilindi",
    'debts.deleted': "Qarz o'chirildi",
    'debts.hasPayments': "To'lovlar tarixi bor qarzni o'chirib bo'lmaydi",

    // Kategoriyalar
    'categories.notFound': 'Kategoriya topilmadi',
    'categories.created': "Kategoriya qo'shildi",
    'categories.updated': 'Kategoriya yangilandi',
    'categories.deleted': "Kategoriya o'chirildi",
    'categories.hasProducts': 'Kategoriyada mahsulotlar mavjud',
    'categories.nameTaken': 'Bu nomli kategoriya allaqachon mavjud',

    // Mahsulotlar
    'products.notFound': 'Mahsulot topilmadi',
    'products.created': "Mahsulot qo'shildi",
    'products.updated': 'Mahsulot yangilandi',
    'products.deleted': "Mahsulot o'chirildi",
    'products.nameTaken': 'Bu nomli mahsulot allaqachon mavjud',

    // Xodimlar
    'staff.notFound': 'Xodim topilmadi',
    'staff.usernameTaken': 'Bu username allaqachon mavjud',
    'staff.created': "Xodim qo'shildi",
    'staff.updated': 'Xodim yangilandi',
    'staff.deleted': "Xodim o'chirildi",
    'staff.cannotDeleteSelf': "O'zingizni o'chira olmaysiz",
    'staff.cannotChangeSelf': "O'z rolingiz yoki holatingizni o'zgartira olmaysiz",

    // Sozlamalar
    'settings.updated': 'Sozlamalar yangilandi',

    // Hisobotlar
    'reports.invalidRange': "Sana oralig'i noto'g'ri",
    'reports.invalidFormat': "Format 'excel' bo'lishi kerak",

    // Klublar (superadmin)
    'clubs.notFound': 'Klub topilmadi',
    'clubs.created': 'Klub yaratildi. 7 kunlik sinov boshlandi',
    'clubs.updated': "Klub ma'lumotlari yangilandi",
    'clubs.extended': 'Obuna {until} gacha uzaytirildi',
    'clubs.blocked': 'Klub bloklandi',
    'clubs.unblocked': 'Klub blokdan chiqarildi',
    'clubs.passwordReset': 'Klub admin paroli yangilandi',
    'clubs.usernameTaken': 'Bu username allaqachon mavjud',
    'clubs.adminNotFound': 'Klub administratori topilmadi',
    'clubs.hasData': "Klubda ma'lumotlar bor, o'chirib bo'lmaydi. Bloklang",
    'clubs.deleted': "Klub o'chirildi",

    // Shartnomalar
    'contracts.created': 'Shartnoma tuzildi va obuna uzaytirildi',
    'contracts.deleted': "Shartnoma o'chirildi",

    // Ommaviy ro'yxatdan o'tish
    'public.phoneAlreadyRegistered':
      "Bu telefon raqam allaqachon ro'yxatdan o'tgan. Yordam uchun biz bilan bog'laning",

    // Umumiy
    'common.validationError': 'Validatsiya xatosi',
    'common.serverError': 'Server xatosi',
    'common.notFound': 'Topilmadi',
    'common.conflict': "Ma'lumotlar ziddiyati — sahifani yangilab qayta urinib ko'ring",
    'common.tooManyRequests': "So'rovlar juda ko'p. Birozdan keyin urinib ko'ring",
  },
  ru: {
    // Auth
    'auth.credentialsRequired': 'Требуются имя пользователя и пароль',
    'auth.invalidCredentials': 'Неверное имя пользователя или пароль',
    'auth.loginSuccess': 'Вход выполнен успешно',
    'auth.refreshRequired': 'Требуется refresh-токен',
    'auth.invalidToken': 'Недействительный токен',
    'auth.tokenExpired': 'Срок действия токена истёк',
    'auth.notAuthenticated': 'Требуется аутентификация',
    'auth.userNotFoundOrBlocked': 'Пользователь не найден или заблокирован',
    'auth.logoutSuccess': 'Выход выполнен успешно',
    'auth.forbidden': 'Нет прав для выполнения этого действия',

    // Подписка
    'subscription.clubNotFound': 'Клуб не найден',
    'subscription.clubBlocked': 'Клуб заблокирован. Свяжитесь с администратором',
    'subscription.expired': 'Срок подписки истёк. Свяжитесь с администратором',
    'subscription.clubContextRequired': 'Требуется контекст клуба',

    // Столы
    'tables.notFound': 'Стол не найден',
    'tables.created': 'Стол добавлен',
    'tables.updated': 'Стол обновлён',
    'tables.deleted': 'Стол удалён',
    'tables.hasActiveSession': 'На столе идёт игра, удалить нельзя',
    'tables.numberTaken': 'Стол с таким номером уже существует',

    // Сессии
    'sessions.notFound': 'Сессия не найдена',
    'sessions.tableBusy': 'На этом столе идёт игра. Сначала завершите её',
    'sessions.started': 'Игра начата',
    'sessions.ended': 'Игра завершена',
    'sessions.endedWithDebt': 'Игра завершена и записана в долг',
    'sessions.alreadyEnded': 'Сессия уже завершена',
    'sessions.onlyActivePausable': 'Приостановить можно только активную сессию',
    'sessions.notPaused': 'Сессия не на паузе',
    'sessions.paused': 'Игра приостановлена',
    'sessions.resumed': 'Игра продолжена',
    'sessions.cancelled': 'Сессия отменена',
    'sessions.onlyActiveCancellable': 'Отменить можно только активную или приостановленную сессию',
    'sessions.debtNeedsCustomer': 'Для записи в долг укажите имя клиента',
    'sessions.debtNeedsComponent': 'Для записи в долг отметьте Стол или Бар',
    'sessions.invalidDiscount': 'Неверная скидка: должна быть не меньше 0 и не больше общей суммы',

    // Заказы
    'orders.itemsRequired': 'Требуются позиции заказа',
    'orders.sessionNotActive': 'Сессия не найдена или не активна',
    'orders.productNotFound': 'Товар не найден: {name}',
    'orders.insufficientStock': "Недостаточно '{name}' на складе (остаток: {stock})",
    'orders.created': 'Заказ добавлен',

    // Долги
    'debts.notFound': 'Долг не найден',
    'debts.alreadyPaid': 'Этот долг уже погашен',
    'debts.invalidAmount': 'Неверная сумма платежа',
    'debts.amountExceedsRemaining': 'Платёж превышает остаток долга ({remaining})',
    'debts.paymentAccepted': 'Платёж принят',
    'debts.deleted': 'Долг удалён',
    'debts.hasPayments': 'Нельзя удалить долг с историей платежей',

    // Категории
    'categories.notFound': 'Категория не найдена',
    'categories.created': 'Категория добавлена',
    'categories.updated': 'Категория обновлена',
    'categories.deleted': 'Категория удалена',
    'categories.hasProducts': 'В категории есть товары',
    'categories.nameTaken': 'Категория с таким названием уже существует',

    // Товары
    'products.notFound': 'Товар не найден',
    'products.created': 'Товар добавлен',
    'products.updated': 'Товар обновлён',
    'products.deleted': 'Товар удалён',
    'products.nameTaken': 'Товар с таким названием уже существует',

    // Сотрудники
    'staff.notFound': 'Сотрудник не найден',
    'staff.usernameTaken': 'Это имя пользователя уже занято',
    'staff.created': 'Сотрудник добавлен',
    'staff.updated': 'Сотрудник обновлён',
    'staff.deleted': 'Сотрудник удалён',
    'staff.cannotDeleteSelf': 'Нельзя удалить самого себя',
    'staff.cannotChangeSelf': 'Нельзя менять свою роль или статус',

    // Настройки
    'settings.updated': 'Настройки обновлены',

    // Отчёты
    'reports.invalidRange': 'Неверный диапазон дат',
    'reports.invalidFormat': "Формат должен быть 'excel'",

    // Клубы (superadmin)
    'clubs.notFound': 'Клуб не найден',
    'clubs.created': 'Клуб создан. Начался 7-дневный пробный период',
    'clubs.updated': 'Данные клуба обновлены',
    'clubs.extended': 'Подписка продлена до {until}',
    'clubs.blocked': 'Клуб заблокирован',
    'clubs.unblocked': 'Клуб разблокирован',
    'clubs.passwordReset': 'Пароль администратора клуба обновлён',
    'clubs.usernameTaken': 'Это имя пользователя уже занято',
    'clubs.adminNotFound': 'Администратор клуба не найден',
    'clubs.hasData': 'В клубе есть данные, удалить нельзя. Заблокируйте',
    'clubs.deleted': 'Клуб удалён',

    // Договоры
    'contracts.created': 'Договор заключён, подписка продлена',
    'contracts.deleted': 'Договор удалён',

    // Публичная регистрация
    'public.phoneAlreadyRegistered':
      'Этот номер телефона уже зарегистрирован. Свяжитесь с нами для помощи',

    // Общее
    'common.validationError': 'Ошибка валидации',
    'common.serverError': 'Ошибка сервера',
    'common.notFound': 'Не найдено',
    'common.conflict': 'Конфликт данных — обновите страницу и попробуйте снова',
    'common.tooManyRequests': 'Слишком много запросов. Попробуйте позже',
  },
};

export const t = (
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
): string => {
  let text = messages[lang]?.[key] ?? messages.uz[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
};
