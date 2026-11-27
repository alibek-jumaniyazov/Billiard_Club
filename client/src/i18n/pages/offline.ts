/** Oflayn rejim, sinxronizatsiya navbati va ilova yangilanishi matnlari */
export default {
  uz: {
    offlineTitle: 'Internet yo‘q',
    offlineDesc: 'Ma’lumot {{time}} holatida. Amallaringiz saqlanmoqda va aloqa tiklanishi bilan yuboriladi.',
    offlineDescNoData: 'Ma’lumot yangilanmayapti. Amallaringiz saqlanmoqda va aloqa tiklanishi bilan yuboriladi.',
    offlineDescRestored: 'Sessiya shu kompyuterdagi oxirgi holatdan tiklandi. Amallaringiz saqlanmoqda.',
    onlineRestored: 'Aloqa tiklandi',
    syncing: 'Yuborilmoqda… {{count}} ta amal',
    syncNow: 'Hoziroq yuborish',
    failedTitle: '{{count}} ta amal yuborilmadi',
    failedDesc: 'Ular server tomonidan qabul qilinmadi. Ko‘rib chiqing — hech biri o‘zi o‘chib ketmaydi.',
    review: 'Ko‘rib chiqish',
    queueTitle: 'Yuborilmagan amallar',
    queueEmpty: 'Yuborilmagan amal yo‘q',
    queueEmptyHint: 'Barcha amallar serverga yetkazilgan.',
    queuePending: 'Navbatda',
    queueFailed: 'Xato',
    retry: 'Qayta urinish',
    discard: 'Voz kechish',
    discardConfirm:
      'Bu amal serverga umuman yuborilmaydi. Unga bog‘liq amallar ham olib tashlanadi. Davom etasizmi?',
    discarded: 'Amal navbatdan olib tashlandi',
    discardedWithLinked: '{{count}} ta bog‘liq amal navbatdan olib tashlandi',
    attempts: '{{count}} urinish',
    savedOffline: 'Oflayn saqlandi — aloqa tiklanganda yuboriladi',
    savedQueued: 'Navbatga qo‘shildi — shu stoldagi oldingi amallar yuborilgach serverga ketadi',
    offlineBlocked: 'Bu amal internetsiz bajarilmaydi',
    errorGoHome: 'Bosh sahifaga',
    errorDetails: 'Texnik tafsilot',
    chunkTitle: 'Dastur yangilangan',
    chunkDesc: 'Yangi versiyani yuklash uchun sahifa qayta ochiladi.',
    networkError: 'Serverga ulanib bo‘lmadi — internet aloqasini tekshiring',
    rateLimited: 'Juda ko‘p urinish. Bir daqiqa kutib, qayta urinib ko‘ring.',
    updateTitle: 'Yangi versiya tayyor',
    updateDesc: 'Yangilash uchun sahifa qayta yuklanadi.',
    updateNow: 'Yangilash',
    lastSync: 'Oxirgi yangilanish: {{time}}',
    // Navbatdagi amallar tavsifi
    actStart: '{{table}} — o‘yin boshlandi',
    actPause: '{{table}} — pauza',
    actResume: '{{table}} — davom ettirildi',
    actEnd: '{{table}} — hisob-kitob',
    actEndDebt: '{{table}} — hisob-kitob, qarz: {{customer}}',
    actOrder: '{{table}} — bar buyurtmasi',
    actBarSale: 'Stolsiz bar savdosi — {{amount}}',
    actBarSaleDebt: 'Stolsiz bar savdosi qarzga — {{customer}}, {{amount}}',
    actCancel: '{{table}} — o‘yin bekor qilindi',
    actTransfer: '{{table}} → {{target}} — o‘yin ko‘chirildi',
    actPlan: '{{table}} — o‘yin vaqti / summa limiti o‘zgardi',
    actGeneric: 'Amal',
    // Oflayn ko'chirish va bekor qilish
    transferOfflineDesc:
      'Internetsiz ko‘chirish: vaqt va narx hozir bo‘linadi. Aloqa tiklanganda server aynan shu payt bo‘yicha qayta hisoblaydi.',
    cancelOfflineNote:
      'Internet yo‘q: o‘yin shu daqiqada to‘xtaydi, server aloqa tiklanganda tekshiradi.',
    // Oflayn hisob-kitob
    checkoutOfflineTitle: 'Internetsiz hisob-kitob',
    checkoutOfflineDesc:
      'Summa shu kassadagi ma’lumot bo‘yicha hisoblandi. Pulni oling — aloqa tiklanishi bilan hisob serverga yuboriladi.',
    checkoutQueuedTitle: 'Hisob-kitob navbat orqali',
    checkoutQueuedDesc:
      'Bu stol bo‘yicha oldingi amallar hali serverga yuborilmoqda. Summa shu kassadagi ma’lumot bo‘yicha hisoblandi — hisob ulardan keyin yuboriladi.',
    checkoutOfflineAdjust:
      'Qo‘lda tuzatish uchun internet kerak: huquq va sabab serverda tekshiriladi.',
    checkoutOfflineSaved: 'Hisob-kitob oflayn saqlandi — aloqa tiklanganda yuboriladi',
    // Internetsiz qarz
    debtOfflineHint:
      'Internetsiz qarz faqat ro‘yxatdagi mijozga yoziladi. Aloqa tiklanganda server mijozni qayta tekshiradi.',
    debtCustomer: 'Qarzdor mijoz (ro‘yxatdan)',
    debtCustomerPlaceholder: 'Ism yoki telefon bo‘yicha qidiring',
    debtPickCustomer: 'Qarz yoziladigan mijozni ro‘yxatdan tanlang',
    debtCustomerNotListed:
      'Bunday mijoz saqlangan ro‘yxatda yo‘q. Yangi yoki internetsiz qo‘shilgan mijozga qarz yozish uchun internet kerak — hozir to‘liq to‘lov oling.',
    debtNoCustomerCache:
      'Mijozlar ro‘yxati bu kompyuterda saqlanmagan — internetsiz qarzga yozib bo‘lmaydi. To‘liq to‘lov oling yoki aloqa tiklanishini kuting.',
    debtNeedsCustomersFeature:
      'Internetsiz qarz «Mijozlar» ro‘yxatidagi mijozga yoziladi — bu bo‘lim tarifingizda yo‘q. To‘liq to‘lov oling yoki aloqa tiklanishini kuting.',
    debtConnectionLost:
      'Aloqa uzildi — qarz yozilmadi. Internetsiz qarz uchun mijozni saqlangan ro‘yxatdan tanlang yoki to‘liq to‘lov oling.',
    debtListAsOf: 'Ro‘yxat {{time}} holatida',
    debtListPartial: 'Ro‘yxat to‘liq saqlanmagan — kerakli mijoz bo‘lmasa, internet kerak.',
    checkoutOfflineReceipt: 'OFLAYN — serverga yuborilishi kutilmoqda',
    mismatchTitle: '{{table}}: oflayn hisob-kitobda farq',
    mismatchDesc:
      'Server hisobi {{expected}}, olingan pul {{collected}} (farq {{difference}}). Ehtimol, internet yo‘q paytda boshqa kassada bar buyurtmasi o‘zgargan. Pul aynan olingandek yozildi, farq o‘yinlar tarixida belgilandi.',
  },
  ru: {
    offlineTitle: 'Нет интернета',
    offlineDesc: 'Данные на {{time}}. Ваши действия сохраняются и будут отправлены при восстановлении связи.',
    offlineDescNoData: 'Данные не обновляются. Ваши действия сохраняются и будут отправлены при восстановлении связи.',
    offlineDescRestored: 'Сессия восстановлена из последнего состояния на этом компьютере. Ваши действия сохраняются.',
    onlineRestored: 'Связь восстановлена',
    syncing: 'Отправка… {{count}} действий',
    syncNow: 'Отправить сейчас',
    failedTitle: 'Не отправлено действий: {{count}}',
    failedDesc: 'Сервер их не принял. Проверьте — ни одно не будет удалено само.',
    review: 'Просмотреть',
    queueTitle: 'Неотправленные действия',
    queueEmpty: 'Неотправленных действий нет',
    queueEmptyHint: 'Все действия доставлены на сервер.',
    queuePending: 'В очереди',
    queueFailed: 'Ошибка',
    retry: 'Повторить',
    discard: 'Отменить',
    discardConfirm:
      'Это действие не будет отправлено на сервер. Связанные действия также будут удалены. Продолжить?',
    discarded: 'Действие удалено из очереди',
    discardedWithLinked_one: 'Из очереди удалено {{count}} связанное действие',
    discardedWithLinked_few: 'Из очереди удалено {{count}} связанных действия',
    discardedWithLinked_many: 'Из очереди удалено {{count}} связанных действий',
    discardedWithLinked: 'Из очереди удалено {{count}} связанных действий',
    attempts: 'попыток: {{count}}',
    savedOffline: 'Сохранено офлайн — отправится при связи',
    savedQueued: 'Добавлено в очередь — уйдёт на сервер после предыдущих действий по этому столу',
    offlineBlocked: 'Это действие требует интернета',
    errorGoHome: 'На главную',
    errorDetails: 'Технические детали',
    chunkTitle: 'Приложение обновлено',
    chunkDesc: 'Страница будет перезагружена для загрузки новой версии.',
    networkError: 'Не удалось подключиться к серверу — проверьте интернет',
    rateLimited: 'Слишком много попыток. Подождите минуту и попробуйте снова.',
    updateTitle: 'Доступна новая версия',
    updateDesc: 'Для обновления страница будет перезагружена.',
    updateNow: 'Обновить',
    lastSync: 'Последнее обновление: {{time}}',
    // Описание действий в очереди
    actStart: '{{table}} — игра начата',
    actPause: '{{table}} — пауза',
    actResume: '{{table}} — продолжено',
    actEnd: '{{table}} — расчёт',
    actEndDebt: '{{table}} — расчёт, долг: {{customer}}',
    actOrder: '{{table}} — заказ бара',
    actBarSale: 'Продажа бара без стола — {{amount}}',
    actBarSaleDebt: 'Продажа бара без стола в долг — {{customer}}, {{amount}}',
    actCancel: '{{table}} — игра отменена',
    actTransfer: '{{table}} → {{target}} — игра перенесена',
    actPlan: '{{table}} — изменены время игры / лимит',
    actGeneric: 'Действие',
    // Офлайн-перенос и отмена
    transferOfflineDesc:
      'Перенос без интернета: время и цена делятся в эту минуту. При восстановлении связи сервер пересчитает именно на этот момент.',
    cancelOfflineNote:
      'Нет интернета: игра остановится в эту минуту, сервер проверит при восстановлении связи.',
    // Офлайн-расчёт
    checkoutOfflineTitle: 'Расчёт без интернета',
    checkoutOfflineDesc:
      'Сумма посчитана по данным этой кассы. Принимайте оплату — расчёт отправится на сервер, как только появится связь.',
    checkoutQueuedTitle: 'Расчёт через очередь',
    checkoutQueuedDesc:
      'Предыдущие действия по этому столу ещё отправляются. Сумма посчитана по данным этой кассы — расчёт уйдёт после них.',
    checkoutOfflineAdjust:
      'Для ручной корректировки нужен интернет: права и причина проверяются на сервере.',
    checkoutOfflineSaved: 'Расчёт сохранён офлайн — отправится при восстановлении связи',
    // Долг без интернета
    debtOfflineHint:
      'Без интернета долг записывается только на клиента из списка. При восстановлении связи сервер проверит клиента ещё раз.',
    debtCustomer: 'Клиент-должник (из списка)',
    debtCustomerPlaceholder: 'Поиск по имени или телефону',
    debtPickCustomer: 'Выберите из списка клиента, на которого записать долг',
    debtCustomerNotListed:
      'Такого клиента нет в сохранённом списке. Чтобы записать долг на нового клиента или добавленного без интернета, нужен интернет — сейчас примите полную оплату.',
    debtNoCustomerCache:
      'Список клиентов не сохранён на этом компьютере — записать в долг без интернета нельзя. Примите полную оплату или дождитесь связи.',
    debtNeedsCustomersFeature:
      'Без интернета долг записывается на клиента из раздела «Клиенты» — этого раздела нет в вашем тарифе. Примите полную оплату или дождитесь связи.',
    debtConnectionLost:
      'Связь прервалась — долг не записан. Для долга без интернета выберите клиента из сохранённого списка или примите полную оплату.',
    debtListAsOf: 'Список на {{time}}',
    debtListPartial: 'Список сохранён не полностью — если нужного клиента нет, нужен интернет.',
    checkoutOfflineReceipt: 'ОФЛАЙН — ожидает отправки на сервер',
    mismatchTitle: '{{table}}: расхождение в офлайн-расчёте',
    mismatchDesc:
      'По серверу {{expected}}, получено {{collected}} (разница {{difference}}). Вероятно, пока не было интернета, на другой кассе изменили заказ бара. Оплата записана как получена, расхождение отмечено в истории игр.',
  },
};
