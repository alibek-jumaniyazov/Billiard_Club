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
    'auth.lockedOut':
      "Juda ko'p muvaffaqiyatsiz urinish. {minutes} daqiqadan keyin qayta urinib ko'ring",
    'auth.wrongCurrentPassword': "Joriy parol noto'g'ri",
    'auth.passwordChanged': "Parol muvaffaqiyatli o'zgartirildi",
    'auth.sessionNotFound': 'Seans topilmadi',
    'auth.sessionRevoked': 'Seans yakunlandi',
    'auth.sessionsRevoked': 'Boshqa barcha seanslar yakunlandi',

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
    'sessions.transferred': "O'yin boshqa stolga ko'chirildi",
    'sessions.transferWhilePaused': "Pauzadagi o'yinni ko'chirib bo'lmaydi — avval davom ettiring",
    'sessions.transferSameTable': "Sessiya allaqachon shu stolda",
    'sessions.paymentsMismatch': "To'lovlar yig'indisi to'lanishi kerak bo'lgan summaga teng emas",
    'sessions.adjustmentForbidden': "Qo'lda tuzatish faqat administratorga ruxsat etilgan",

    // Buyurtmalar
    'orders.itemsRequired': 'Buyurtma elementlari talab qilinadi',
    'orders.sessionNotActive': 'Sessiya topilmadi yoki faol emas',
    'orders.productNotFound': 'Mahsulot topilmadi: {name}',
    'orders.insufficientStock': "'{name}' omborda yetarli emas (qoldiq: {stock})",
    'orders.created': "Buyurtma qo'shildi",
    'orders.notFound': 'Buyurtma topilmadi',
    'orders.cancelled': 'Buyurtma bekor qilindi',
    'orders.notCancellable': 'Faqat ochiq buyurtmani bekor qilish mumkin',

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
    'settings.invalidTimezone': "Vaqt mintaqasi qo'llab-quvvatlanmaydi",

    // Fikr-mulohaza markazi
    'feedback.created': "Fikr-mulohaza yuborildi. Tez orada ko'rib chiqamiz",
    'feedback.notFound': 'Fikr-mulohaza topilmadi',
    'feedback.tooManyAttachments': "Eng ko'pi bilan {max} ta fayl biriktirish mumkin",
    'feedback.attachmentTooLarge': 'Har bir fayl hajmi {max} KB dan oshmasligi kerak',
    'feedback.invalidAttachment':
      "Fayl formati noto'g'ri — faqat PNG, JPEG yoki WebP rasm qabul qilinadi",
    'feedback.statusUpdated': 'Fikr-mulohaza holati yangilandi',
    'feedback.replied': 'Javob yuborildi',
    'feedback.replyNotificationTitle': 'Fikringizga javob berildi: {subject}',

    // Xabarnomalar
    'notifications.notFound': 'Xabarnoma topilmadi',
    'notifications.markedRead': "Xabarnoma o'qilgan deb belgilandi",
    'notifications.allMarkedRead': "Barcha xabarnomalar o'qilgan deb belgilandi",
    'notifications.sent': 'Xabarnoma yuborildi',
    'notifications.sentToAll': 'Xabarnoma {count} ta klubga yuborildi',

    // Platforma (superadmin)
    'platform.unknownTelegramEvent': "Noma'lum Telegram hodisasi: {event}",
    'platform.invalidEventValue': "'{event}' hodisasi qiymati true/false bo'lishi kerak",
    'platform.telegramSettingsUpdated': 'Telegram xabarnoma sozlamalari yangilandi',

    // Hisobotlar
    'reports.invalidRange': "Sana oralig'i noto'g'ri",
    'reports.invalidFormat': "Format 'excel' bo'lishi kerak",
    'reports.sheet': 'Hisobot',
    'reports.fileName': 'hisobot',
    'reports.colNo': '№',
    'reports.colTable': 'Stol',
    'reports.colCustomer': 'Mijoz',
    'reports.colStart': 'Boshlangan',
    'reports.colEnd': 'Tugagan',
    'reports.colDuration': 'Davomiylik (daq)',
    'reports.colTableAmount': 'Stol summasi',
    'reports.colBarAmount': 'Bar summasi',
    'reports.colTotal': 'Jami',
    'reports.colMethod': "To'lov usuli",
    'reports.colPaid': "To'langan",
    'reports.totalRow': 'JAMI:',
    'reports.paidYes': 'Ha',
    'reports.paidNo': "Yo'q (qarz)",

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

    // Obuna savdosi (tariflar, hisob-fakturalar, kuponlar)
    'subscription.pendingExists':
      "Sizda tasdiqlanishi kutilayotgan to'lov so'rovi bor. Avval uni bekor qiling yoki tasdiqlanishini kuting",
    'subscription.planNotFound': 'Tarif topilmadi',
    'subscription.planInactive': 'Bu tarif hozircha mavjud emas',
    'subscription.planCodeTaken': 'Bu kodli tarif allaqachon mavjud',
    'subscription.planCreated': "Tarif qo'shildi",
    'subscription.planUpdated': 'Tarif yangilandi',
    'subscription.planDeactivated': 'Tarif faolsizlantirildi',
    'subscription.couponNotFound': 'Kupon topilmadi',
    'subscription.couponInactive': 'Kupon faol emas',
    'subscription.couponNotYetValid': 'Kupon hali kuchga kirmagan',
    'subscription.couponExpired': 'Kupon muddati tugagan',
    'subscription.couponUsedUp': 'Kupon ishlatish limiti tugagan',
    'subscription.couponWrongPlan': 'Bu kupon tanlangan tarifga mos emas',
    'subscription.couponCodeTaken': 'Bu kodli kupon allaqachon mavjud',
    'subscription.couponCreated': "Kupon qo'shildi",
    'subscription.couponUpdated': 'Kupon yangilandi',
    'subscription.couponDeactivated': 'Kupon faolsizlantirildi',
    'subscription.invalidCouponValue': "Kupon qiymati noto'g'ri (foiz 0-100 oralig'ida bo'lishi kerak)",
    'subscription.invalidCouponWindow': "Kupon amal qilish oralig'i noto'g'ri",
    'subscription.invoiceNotFound': 'Hisob-faktura topilmadi',
    'subscription.invoiceNotPending': 'Bu hisob-faktura kutish holatida emas',
    'subscription.purchaseCreated':
      "To'lov so'rovi yuborildi. Tasdiqlangach obuna avtomatik uzaytiriladi",
    'subscription.invoiceCancelled': "To'lov so'rovi bekor qilindi",
    'subscription.invoiceConfirmed': "To'lov tasdiqlandi — obuna uzaytirildi",
    'subscription.invoiceRejected': "To'lov so'rovi rad etildi",

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

    // Mijozlar
    'customers.notFound': 'Mijoz topilmadi',
    'customers.created': "Mijoz qo'shildi",
    'customers.updated': "Mijoz ma'lumotlari yangilandi",
    'customers.deleted': "Mijoz o'chirildi",
    'customers.phoneTaken': 'Bu telefon raqamli mijoz allaqachon mavjud',
    'customers.hasDebts': "Ochiq qarzi bor mijozni o'chirib bo'lmaydi",

    // Xarajatlar
    'expenses.notFound': 'Xarajat topilmadi',
    'expenses.created': "Xarajat qo'shildi",
    'expenses.updated': 'Xarajat yangilandi',
    'expenses.deleted': "Xarajat o'chirildi",

    // Bronlar
    'reservations.notFound': 'Bron topilmadi',
    'reservations.created': 'Bron yaratildi',
    'reservations.updated': 'Bron yangilandi',
    'reservations.cancelled': 'Bron bekor qilindi',
    'reservations.invalidTransition': "Bron holatini bunday o'zgartirib bo'lmaydi",
    'reservations.overlapWarning': 'Diqqat: bu vaqtda stolda boshqa bron bor',
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
    'auth.lockedOut': 'Слишком много неудачных попыток. Повторите через {minutes} мин.',
    'auth.wrongCurrentPassword': 'Текущий пароль неверен',
    'auth.passwordChanged': 'Пароль успешно изменён',
    'auth.sessionNotFound': 'Сеанс не найден',
    'auth.sessionRevoked': 'Сеанс завершён',
    'auth.sessionsRevoked': 'Все остальные сеансы завершены',

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
    'sessions.transferred': 'Игра перенесена на другой стол',
    'sessions.transferWhilePaused': 'Нельзя перенести игру на паузе — сначала возобновите её',
    'sessions.transferSameTable': 'Сессия уже на этом столе',
    'sessions.paymentsMismatch': 'Сумма платежей не совпадает с суммой к оплате',
    'sessions.adjustmentForbidden': 'Ручная корректировка доступна только администратору',

    // Заказы
    'orders.itemsRequired': 'Требуются позиции заказа',
    'orders.sessionNotActive': 'Сессия не найдена или не активна',
    'orders.productNotFound': 'Товар не найден: {name}',
    'orders.insufficientStock': "Недостаточно '{name}' на складе (остаток: {stock})",
    'orders.created': 'Заказ добавлен',
    'orders.notFound': 'Заказ не найден',
    'orders.cancelled': 'Заказ отменён',
    'orders.notCancellable': 'Отменить можно только открытый заказ',

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
    'settings.invalidTimezone': 'Часовой пояс не поддерживается',

    // Центр отзывов
    'feedback.created': 'Отзыв отправлен. Мы рассмотрим его в ближайшее время',
    'feedback.notFound': 'Отзыв не найден',
    'feedback.tooManyAttachments': 'Можно прикрепить не более {max} файлов',
    'feedback.attachmentTooLarge': 'Размер каждого файла не должен превышать {max} КБ',
    'feedback.invalidAttachment':
      'Неверный формат файла — принимаются только изображения PNG, JPEG или WebP',
    'feedback.statusUpdated': 'Статус отзыва обновлён',
    'feedback.replied': 'Ответ отправлен',
    'feedback.replyNotificationTitle': 'На ваш отзыв дан ответ: {subject}',

    // Уведомления
    'notifications.notFound': 'Уведомление не найдено',
    'notifications.markedRead': 'Уведомление отмечено как прочитанное',
    'notifications.allMarkedRead': 'Все уведомления отмечены как прочитанные',
    'notifications.sent': 'Уведомление отправлено',
    'notifications.sentToAll': 'Уведомление отправлено {count} клубам',

    // Платформа (superadmin)
    'platform.unknownTelegramEvent': 'Неизвестное событие Telegram: {event}',
    'platform.invalidEventValue': "Значение события '{event}' должно быть true/false",
    'platform.telegramSettingsUpdated': 'Настройки уведомлений Telegram обновлены',

    // Отчёты
    'reports.invalidRange': 'Неверный диапазон дат',
    'reports.invalidFormat': "Формат должен быть 'excel'",
    'reports.sheet': 'Отчёт',
    'reports.fileName': 'otchet',
    'reports.colNo': '№',
    'reports.colTable': 'Стол',
    'reports.colCustomer': 'Клиент',
    'reports.colStart': 'Начало',
    'reports.colEnd': 'Конец',
    'reports.colDuration': 'Длительность (мин)',
    'reports.colTableAmount': 'Сумма стола',
    'reports.colBarAmount': 'Сумма бара',
    'reports.colTotal': 'Итого',
    'reports.colMethod': 'Способ оплаты',
    'reports.colPaid': 'Оплачено',
    'reports.totalRow': 'ИТОГО:',
    'reports.paidYes': 'Да',
    'reports.paidNo': 'Нет (долг)',

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

    // Продажа подписок (тарифы, счета, купоны)
    'subscription.pendingExists':
      'У вас уже есть заявка на оплату, ожидающая подтверждения. Отмените её или дождитесь подтверждения',
    'subscription.planNotFound': 'Тариф не найден',
    'subscription.planInactive': 'Этот тариф сейчас недоступен',
    'subscription.planCodeTaken': 'Тариф с таким кодом уже существует',
    'subscription.planCreated': 'Тариф добавлен',
    'subscription.planUpdated': 'Тариф обновлён',
    'subscription.planDeactivated': 'Тариф деактивирован',
    'subscription.couponNotFound': 'Купон не найден',
    'subscription.couponInactive': 'Купон не активен',
    'subscription.couponNotYetValid': 'Купон ещё не вступил в силу',
    'subscription.couponExpired': 'Срок действия купона истёк',
    'subscription.couponUsedUp': 'Лимит использования купона исчерпан',
    'subscription.couponWrongPlan': 'Этот купон не подходит для выбранного тарифа',
    'subscription.couponCodeTaken': 'Купон с таким кодом уже существует',
    'subscription.couponCreated': 'Купон добавлен',
    'subscription.couponUpdated': 'Купон обновлён',
    'subscription.couponDeactivated': 'Купон деактивирован',
    'subscription.invalidCouponValue': 'Неверное значение купона (процент должен быть в пределах 0-100)',
    'subscription.invalidCouponWindow': 'Неверный период действия купона',
    'subscription.invoiceNotFound': 'Счёт не найден',
    'subscription.invoiceNotPending': 'Этот счёт не находится в статусе ожидания',
    'subscription.purchaseCreated':
      'Заявка на оплату отправлена. После подтверждения подписка продлится автоматически',
    'subscription.invoiceCancelled': 'Заявка на оплату отменена',
    'subscription.invoiceConfirmed': 'Оплата подтверждена — подписка продлена',
    'subscription.invoiceRejected': 'Заявка на оплату отклонена',

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

    // Клиенты
    'customers.notFound': 'Клиент не найден',
    'customers.created': 'Клиент добавлен',
    'customers.updated': 'Данные клиента обновлены',
    'customers.deleted': 'Клиент удалён',
    'customers.phoneTaken': 'Клиент с таким номером телефона уже существует',
    'customers.hasDebts': 'Нельзя удалить клиента с открытым долгом',

    // Расходы
    'expenses.notFound': 'Расход не найден',
    'expenses.created': 'Расход добавлен',
    'expenses.updated': 'Расход обновлён',
    'expenses.deleted': 'Расход удалён',

    // Брони
    'reservations.notFound': 'Бронь не найдена',
    'reservations.created': 'Бронь создана',
    'reservations.updated': 'Бронь обновлена',
    'reservations.cancelled': 'Бронь отменена',
    'reservations.invalidTransition': 'Недопустимое изменение статуса брони',
    'reservations.overlapWarning': 'Внимание: на это время у стола есть другая бронь',
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
