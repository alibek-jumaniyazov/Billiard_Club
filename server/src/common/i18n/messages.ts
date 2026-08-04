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
    'tables.priceChangeWhileBusy':
      "Stolda ochiq o'yin bor — narxni o'zgartirib bo'lmaydi. Avval o'yinni yakunlang",

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
    'sessions.barChanged':
      "Bar summasi o'zgardi ({expected} → {actual}). Chek yangilandi — yangi summani tekshirib, qaytadan tasdiqlang",
    'sessions.cancelNeedsAdmin':
      "Bar buyurtmasi bo'lgan yoki uzoq davom etgan o'yinni bekor qilish faqat administratorga ruxsat etilgan. Hisobni yakunlang yoki administratorga murojaat qiling",

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
    // Qator O'CHIRILMAYDI, hisobdan chiqariladi (qoldiq 0 bo'ladi) — xabar ham
    // aynan shuni aytishi kerak, aks holda kassir yozuv yo'qolgan deb o'ylaydi
    'debts.deleted': 'Qarz hisobdan chiqarildi',
    'debts.hasPayments': "To'lovlar tarixi bor qarzni hisobdan chiqarib bo'lmaydi",

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
    'products.stockAdjusted': "Ombor qoldig'i yangilandi",
    'products.stockNegative': "«{name}» qoldig'i manfiy bo'lib qoladi (joriy qoldiq: {stock})",

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

    // Chiroqlar
    'lights.updated': 'Chiroq sozlamalari saqlandi',
    'lights.settingsUpdated': 'Chiroq rejimi yangilandi',
    'lights.tested': "Sinov buyrug'i yuborildi",
    'lights.overrideSet': "Qo'lda boshqaruv yoqildi",
    'lights.overrideCleared': "Qo'lda boshqaruv bekor qilindi",
    'lights.tokenIssued': 'Yangi bridge tokeni yaratildi',
    'lights.invalidHost':
      "Rele manzili noto'g'ri: IP yoki host ko'rsating, http drayveri uchun esa onUrl va offUrl kerak",
    'lights.notConfigured': "Bu stolda chiroq sozlanmagan yoki boshqaruv o'chirilgan",
    'lights.bridgeOffline': "Klub agenti ulanmagan — buyruq u ulangach qo'llanadi",
    'lights.deviceUnreachable': "Relega ulanib bo'lmadi",
    'lights.invalidConfig':
      "Drayver sozlamalari to'liq emas: tanlangan drayver uchun majburiy maydonlarni to'ldiring",
    'lights.driverBridgeOnly':
      "Bu drayver faqat lokal agent (bridge) rejimida ishlaydi — klub rejimini 'bridge' ga o'zgartiring",
    'lights.allApplied': "Barcha stollarga qo'llandi",
    'lights.discoverQueued': "Qurilmalarni qidirish boshlandi — natija bir necha soniyada ko'rinadi",
    'lights.discoverUnavailable':
      "Qidiruv uchun klubda lokal agent (bridge) o'rnatilgan bo'lishi kerak",

    // Fikr-mulohaza markazi
    'feedback.created': "Fikr-mulohaza yuborildi. Tez orada ko'rib chiqamiz",
    'feedback.notFound': 'Fikr-mulohaza topilmadi',
    'feedback.tooManyAttachments': "Eng ko'pi bilan {max} ta fayl biriktirish mumkin",
    'feedback.attachmentTooLarge': 'Har bir fayl hajmi {max} KB dan oshmasligi kerak',
    'feedback.invalidAttachment':
      "Fayl formati noto'g'ri — faqat PNG, JPEG yoki WebP rasm qabul qilinadi",
    'feedback.attachmentNotFound': 'Biriktirilgan fayl topilmadi',
    'feedback.statusUpdated': 'Fikr-mulohaza holati yangilandi',
    'feedback.replied': 'Javob yuborildi',
    'feedback.replyNotificationTitle': 'Fikringizga javob berildi: {subject}',

    // Xabarnomalar
    'notifications.notFound': 'Xabarnoma topilmadi',
    'notifications.markedRead': "Xabarnoma o'qilgan deb belgilandi",
    'notifications.allMarkedRead': "Barcha xabarnomalar o'qilgan deb belgilandi",
    'notifications.sent': 'Xabarnoma yuborildi',
    'notifications.sentToAll': 'Xabarnoma {count} ta klubga yuborildi',
    'notifications.markedUnread': "Xabarnoma o'qilmagan deb belgilandi",
    'notifications.deleted': "Xabarnoma o'chirildi",
    'notifications.bulkUpdated': '{count} ta xabarnoma yangilandi',
    'notifications.bulkDeleted': "{count} ta xabarnoma o'chirildi",
    'notifications.sentToClubs': 'Xabarnoma {count} ta klubga yuborildi',
    'notifications.noRecipients': 'Tanlangan shartga mos klub topilmadi',
    'notifications.batchNotFound': "E'lon topilmadi",
    'notifications.recalled': "E'lon qaytarib olindi: {count} ta yozuv o'chirildi",
    'notifications.rowDeleted': "Yozuv o'chirildi",

    // Platforma (superadmin)
    'platform.unknownTelegramEvent': "Noma'lum Telegram hodisasi: {event}",
    'platform.invalidEventValue': "'{event}' hodisasi qiymati true/false bo'lishi kerak",
    'platform.telegramSettingsUpdated': 'Telegram xabarnoma sozlamalari yangilandi',
    'platform.configUpdated': 'Platforma sozlamalari yangilandi',

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
    'reports.colDiscount': 'Chegirma',
    'reports.colAdjustment': 'Tuzatish',
    'reports.colTotal': 'Jami',
    'reports.periodLabel': 'Davr',
    'reports.colMethod': "To'lov usuli",
    'reports.colPaid': "To'langan",
    'reports.totalRow': 'JAMI:',
    'reports.paidYes': 'Ha',
    'reports.paidNo': "Yo'q (qarz)",

    // To'lov usullari (Excel ustunlari uchun — xom enum o'rniga)
    'payment.cash': 'Naqd',
    'payment.card': 'Karta',
    'payment.transfer': "O'tkazma",

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
    'clubs.extendChoiceRequired': "Uzaytirish uchun yo oylar sonini, yo aniq sanani bering (aynan bittasini)",
    'clubs.wouldShortenSubscription':
      "Yangi sana joriy obuna muddatidan oldin — to'langan kunlar yo'qoladi. Qisqartirishni aniq tasdiqlang",

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
    'subscription.staleInvoice':
      "Bu eski hisob-faktura tasdiqlanmaydi: shu klub uchun keyinroq berilgan to'lov allaqachon qabul qilingan",
    'subscription.purchaseCreated':
      "To'lov so'rovi yuborildi. Tasdiqlangach obuna avtomatik uzaytiriladi",
    'subscription.invoiceCancelled': "To'lov so'rovi bekor qilindi",
    'subscription.invoiceConfirmed': "To'lov tasdiqlandi — obuna uzaytirildi",
    'subscription.invoiceRejected': "To'lov so'rovi rad etildi",

    // Shartnomalar
    'contracts.created': 'Shartnoma tuzildi va obuna uzaytirildi',
    'contracts.deleted': "Shartnoma o'chirildi",
    'contracts.hasPaidInvoice':
      "Bu shartnomaga to'langan hisob-faktura bog'langan — o'chirib bo'lmaydi",

    // Ommaviy ro'yxatdan o'tish
    'public.phoneAlreadyRegistered':
      "Bu telefon raqam allaqachon ro'yxatdan o'tgan. Yordam uchun biz bilan bog'laning",
    'public.invalidPhone': "Telefon raqam noto'g'ri — kamida bitta raqam bo'lishi kerak",

    // Umumiy
    'common.validationError': 'Validatsiya xatosi',
    'common.serverError': 'Server xatosi',
    'common.notFound': 'Topilmadi',
    'common.conflict': "Ma'lumotlar ziddiyati — sahifani yangilab qayta urinib ko'ring",
    // Aynan shu amal AYNI DAMDA bajarilmoqda (idempotentlik kaliti band) —
    // klient birozdan keyin qayta uradi va tayyor javobni oladi
    'common.tryAgain': "Amal bajarilmoqda — birozdan keyin qayta urinib ko'ring",
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

    // Desktop relizlari
    'releases.notFound': 'Reliz topilmadi',
    'releases.fileMissing': "Reliz fayli serverda topilmadi",
    'releases.fileRequired': 'Fayl yuklanmadi',
    'releases.badVersion': "Versiya noto'g'ri (masalan: 1.0.1)",
    'releases.badExtension': 'Bu platforma uchun ruxsat etilgan kengaytmalar: {allowed}',
    'releases.versionExists': 'Bu platforma uchun bunday versiya allaqachon mavjud',
    'releases.uploaded': 'Reliz yuklandi',
    'releases.published': 'Reliz nashr etildi',
    'releases.unpublished': 'Reliz nashrdan olindi',
    'releases.deleted': "Reliz o'chirildi",
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
    'tables.priceChangeWhileBusy':
      'На столе идёт игра — изменить цену нельзя. Сначала завершите игру',

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
    'sessions.barChanged':
      'Сумма бара изменилась ({expected} → {actual}). Счёт обновлён — проверьте новую сумму и подтвердите заново',
    'sessions.cancelNeedsAdmin':
      'Отменить длительную игру или игру с заказами бара может только администратор. Завершите расчёт или обратитесь к администратору',

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
    'debts.deleted': 'Долг списан',
    'debts.hasPayments': 'Нельзя списать долг с историей платежей',

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
    'products.stockAdjusted': 'Остаток на складе обновлён',
    'products.stockNegative': 'Остаток «{name}» станет отрицательным (текущий остаток: {stock})',

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

    // Освещение
    'lights.updated': 'Настройки освещения сохранены',
    'lights.settingsUpdated': 'Режим освещения обновлён',
    'lights.tested': 'Тестовая команда отправлена',
    'lights.overrideSet': 'Ручное управление включено',
    'lights.overrideCleared': 'Ручное управление отменено',
    'lights.tokenIssued': 'Новый токен моста создан',
    'lights.invalidHost':
      'Неверный адрес реле: укажите IP или хост, а для драйвера http — onUrl и offUrl',
    'lights.notConfigured': 'На этом столе освещение не настроено или управление отключено',
    'lights.bridgeOffline': 'Агент клуба не на связи — команда применится после подключения',
    'lights.deviceUnreachable': 'Не удалось подключиться к реле',
    'lights.invalidConfig':
      'Настройки драйвера неполные: заполните обязательные поля для выбранного драйвера',
    'lights.driverBridgeOnly':
      'Этот драйвер работает только через локальный агент (bridge) — переключите режим клуба на «bridge»',
    'lights.allApplied': 'Применено ко всем столам',
    'lights.discoverQueued': 'Поиск устройств запущен — результат появится через несколько секунд',
    'lights.discoverUnavailable':
      'Для поиска в клубе должен быть установлен локальный агент (bridge)',

    // Центр отзывов
    'feedback.created': 'Отзыв отправлен. Мы рассмотрим его в ближайшее время',
    'feedback.notFound': 'Отзыв не найден',
    'feedback.tooManyAttachments': 'Можно прикрепить не более {max} файлов',
    'feedback.attachmentTooLarge': 'Размер каждого файла не должен превышать {max} КБ',
    'feedback.invalidAttachment':
      'Неверный формат файла — принимаются только изображения PNG, JPEG или WebP',
    'feedback.attachmentNotFound': 'Вложение не найдено',
    'feedback.statusUpdated': 'Статус отзыва обновлён',
    'feedback.replied': 'Ответ отправлен',
    'feedback.replyNotificationTitle': 'На ваш отзыв дан ответ: {subject}',

    // Уведомления
    'notifications.notFound': 'Уведомление не найдено',
    'notifications.markedRead': 'Уведомление отмечено как прочитанное',
    'notifications.allMarkedRead': 'Все уведомления отмечены как прочитанные',
    'notifications.sent': 'Уведомление отправлено',
    'notifications.sentToAll': 'Уведомление отправлено {count} клубам',
    'notifications.markedUnread': 'Уведомление отмечено как непрочитанное',
    'notifications.deleted': 'Уведомление удалено',
    'notifications.bulkUpdated': 'Обновлено уведомлений: {count}',
    'notifications.bulkDeleted': 'Удалено уведомлений: {count}',
    'notifications.sentToClubs': 'Уведомление отправлено {count} клубам',
    'notifications.noRecipients': 'Не найдено клубов, подходящих под условие',
    'notifications.batchNotFound': 'Рассылка не найдена',
    'notifications.recalled': 'Рассылка отозвана: удалено записей — {count}',
    'notifications.rowDeleted': 'Запись удалена',

    // Платформа (superadmin)
    'platform.unknownTelegramEvent': 'Неизвестное событие Telegram: {event}',
    'platform.invalidEventValue': "Значение события '{event}' должно быть true/false",
    'platform.telegramSettingsUpdated': 'Настройки уведомлений Telegram обновлены',
    'platform.configUpdated': 'Настройки платформы обновлены',

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
    'reports.colDiscount': 'Скидка',
    'reports.colAdjustment': 'Корректировка',
    'reports.colTotal': 'Итого',
    'reports.periodLabel': 'Период',
    'reports.colMethod': 'Способ оплаты',
    'reports.colPaid': 'Оплачено',
    'reports.totalRow': 'ИТОГО:',
    'reports.paidYes': 'Да',
    'reports.paidNo': 'Нет (долг)',

    // Способы оплаты (для колонок Excel — вместо сырого enum)
    'payment.cash': 'Наличные',
    'payment.card': 'Карта',
    'payment.transfer': 'Перевод',

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
    'clubs.extendChoiceRequired': 'Укажите либо количество месяцев, либо точную дату (ровно одно)',
    'clubs.wouldShortenSubscription':
      'Новая дата раньше текущего срока подписки — оплаченные дни будут потеряны. Подтвердите сокращение явно',

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
    'subscription.staleInvoice':
      'Этот устаревший счёт нельзя подтвердить: по данному клубу уже принята более поздняя оплата',
    'subscription.purchaseCreated':
      'Заявка на оплату отправлена. После подтверждения подписка продлится автоматически',
    'subscription.invoiceCancelled': 'Заявка на оплату отменена',
    'subscription.invoiceConfirmed': 'Оплата подтверждена — подписка продлена',
    'subscription.invoiceRejected': 'Заявка на оплату отклонена',

    // Договоры
    'contracts.created': 'Договор заключён, подписка продлена',
    'contracts.deleted': 'Договор удалён',
    'contracts.hasPaidInvoice': 'К этому договору привязан оплаченный счёт — удалить нельзя',

    // Публичная регистрация
    'public.phoneAlreadyRegistered':
      'Этот номер телефона уже зарегистрирован. Свяжитесь с нами для помощи',
    'public.invalidPhone': 'Неверный номер телефона — нужна хотя бы одна цифра',

    // Общее
    'common.validationError': 'Ошибка валидации',
    'common.serverError': 'Ошибка сервера',
    'common.notFound': 'Не найдено',
    'common.conflict': 'Конфликт данных — обновите страницу и попробуйте снова',
    'common.tryAgain': 'Операция выполняется — повторите через несколько секунд',
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

    // Релизы desktop-приложения
    'releases.notFound': 'Релиз не найден',
    'releases.fileMissing': 'Файл релиза не найден на сервере',
    'releases.fileRequired': 'Файл не загружен',
    'releases.badVersion': 'Неверная версия (например: 1.0.1)',
    'releases.badExtension': 'Разрешённые расширения для этой платформы: {allowed}',
    'releases.versionExists': 'Такая версия для этой платформы уже существует',
    'releases.uploaded': 'Релиз загружен',
    'releases.published': 'Релиз опубликован',
    'releases.unpublished': 'Релиз снят с публикации',
    'releases.deleted': 'Релиз удалён',
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
      // Global almashtirish + funksiya-o'rnini bosuvchi: satrli shablon faqat
      // BIRINCHI uchrashuvni almashtirardi va qiymat ichidagi `$&`/`$1` kabi
      // ketma-ketliklarni kengaytirib yuborardi (masalan klub yozgan mavzu
      // xabarnoma sarlavhasiga tushganda).
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v));
    }
  }
  return text;
};
