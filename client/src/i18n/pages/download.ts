/** Desktop dasturni yuklab olish sahifasi */
export default {
  uz: {
    title: 'Desktop dastur',
    subtitle:
      'Kassa kompyuteri uchun alohida dastur — o‘z oynasi, ish stolidagi yorlig‘i va internetsiz ishlash imkoni bilan.',
    metaTitle: 'Desktop dasturni yuklab olish — Billiard Club',
    metaDesc:
      'Billiard Club desktop dasturini Windows, macOS va Linux uchun yuklab oling. Avtomatik yangilanadi, internetsiz ishlaydi.',

    downloadFor: '{{platform}} uchun yuklab olish',
    version: 'Versiya {{version}}',
    size: 'Hajmi: {{size}}',
    published: 'Chiqarilgan: {{date}}',
    otherPlatforms: 'Boshqa tizimlar',
    whatsNew: 'Ushbu versiyada',

    empty: 'Hozircha yuklab olish uchun tayyor versiya yo‘q',
    emptyHint:
      'Ilova brauzerda to‘liq ishlaydi — kassani hozir ham ochsangiz bo‘ladi. Desktop dastur tayyor bo‘lgach shu yerda paydo bo‘ladi.',
    /* Superadmin ko'radigan qo'shimcha — u buni O'ZI hal qila oladi */
    emptyAdmin: 'Siz platforma egasisiz — reliz yuklash sizda',
    emptyAdminHint:
      'Hali birorta o‘rnatgich nashr etilmagan. «Desktop relizlari» bo‘limida faylni yuklab, «Nashr etish» ni bossangiz bu sahifa darhol to‘ladi.',
    goToReleases: 'Desktop relizlari',
    loadError: 'Versiyalar ro‘yxatini olib bo‘lmadi',
    retry: 'Qayta urinish',

    /* Desktop qobiq ichida ochilganda */
    alreadyDesktop: 'Siz desktop dasturdasiz',
    alreadyDesktopDesc:
      'Joriy versiya: {{version}}. Dastur yangilanishlarni o‘zi tekshiradi va o‘rnatadi — bu yerdan qayta yuklab olish shart emas.',
    upToDate: 'Eng so‘nggi versiya o‘rnatilgan',
    updateAvailable: 'Yangi versiya mavjud: {{version}}',
    updateDownloading: 'Yangilanish yuklanmoqda… {{percent}}%',
    updateReady: 'Yangilanish tayyor — dastur yopilganda o‘rnatiladi',
    restartNow: 'Hoziroq qayta ishga tushirish',
    checkUpdates: 'Yangilanishni tekshirish',

    /* Ishonch/xavfsizlik bloki */
    trustTitle: 'Yuklab olishdan oldin',
    trustSigned:
      'Fayl aynan shu serverdan beriladi — boshqa saytdan yuklab olmang.',
    trustSmartScreen:
      'Windows «noma’lum nashriyot» ogohlantirishini ko‘rsatsa: «Batafsil» → «Baribir ishga tushirish».',
    trustChecksum: 'SHA-512 nazorat summasi',
    copied: 'Nusxalandi',

    /* Nima beradi */
    featuresTitle: 'Nima uchun desktop dastur',
    featureWindow: 'O‘z oynasi va yorlig‘i',
    featureWindowDesc: 'Brauzer tabi emas — ish stolidan bir bosishda ochiladi.',
    featureOffline: 'Internetsiz ishlaydi',
    featureOfflineDesc:
      'Aloqa uzilsa kassa to‘xtamaydi: taymer yuraveradi, amallar saqlanadi va aloqa tiklanishi bilan yuboriladi.',
    featureUpdates: 'O‘zi yangilanadi',
    featureUpdatesDesc: 'Yangi versiya chiqsa dastur uni o‘zi yuklab oladi va o‘rnatadi.',
    featureGuard: 'Tasodifiy yopilishdan himoya',
    featureGuardDesc: 'Yuborilmagan amallar bo‘lsa dastur yopilishdan oldin ogohlantiradi.',

    /* Talablar */
    requirements: 'Talablar',
    reqWin: 'Windows 10 yoki undan yangi (64-bit)',
    reqMac: 'macOS 11 yoki undan yangi',
    reqLinux: 'AppImage — ko‘pchilik zamonaviy distributivlar',

    platformWin: 'Windows',
    platformMac: 'macOS',
    platformLinux: 'Linux',

    backHome: 'Bosh sahifaga',
    openApp: 'Brauzerda ochish',
  },
  ru: {
    title: 'Приложение для компьютера',
    subtitle:
      'Отдельная программа для кассового компьютера — своё окно, ярлык на рабочем столе и работа без интернета.',
    metaTitle: 'Скачать приложение — Billiard Club',
    metaDesc:
      'Скачайте приложение Billiard Club для Windows, macOS и Linux. Обновляется автоматически, работает без интернета.',

    downloadFor: 'Скачать для {{platform}}',
    version: 'Версия {{version}}',
    size: 'Размер: {{size}}',
    published: 'Выпущено: {{date}}',
    otherPlatforms: 'Другие системы',
    whatsNew: 'В этой версии',

    empty: 'Пока нет версии, готовой к скачиванию',
    emptyHint:
      'Приложение полностью работает в браузере — кассу можно открыть уже сейчас. Десктоп-версия появится здесь, когда будет готова.',
    emptyAdmin: 'Вы владелец платформы — загрузка релизов за вами',
    emptyAdminHint:
      'Ни один установщик пока не опубликован. Загрузите файл в разделе «Релизы для ПК» и нажмите «Опубликовать» — эта страница сразу заполнится.',
    goToReleases: 'Релизы для ПК',
    loadError: 'Не удалось загрузить список версий',
    retry: 'Повторить',

    alreadyDesktop: 'Вы в десктоп-приложении',
    alreadyDesktopDesc:
      'Текущая версия: {{version}}. Программа сама проверяет и устанавливает обновления — скачивать заново не нужно.',
    upToDate: 'Установлена последняя версия',
    updateAvailable: 'Доступна новая версия: {{version}}',
    updateDownloading: 'Загрузка обновления… {{percent}}%',
    updateReady: 'Обновление готово — установится при закрытии программы',
    restartNow: 'Перезапустить сейчас',
    checkUpdates: 'Проверить обновления',

    trustTitle: 'Перед загрузкой',
    trustSigned: 'Файл выдаётся именно этим сервером — не скачивайте с других сайтов.',
    trustSmartScreen:
      'Если Windows покажет «неизвестный издатель»: «Подробнее» → «Выполнить в любом случае».',
    trustChecksum: 'Контрольная сумма SHA-512',
    copied: 'Скопировано',

    featuresTitle: 'Зачем десктоп-приложение',
    featureWindow: 'Своё окно и ярлык',
    featureWindowDesc: 'Не вкладка браузера — открывается с рабочего стола одним кликом.',
    featureOffline: 'Работает без интернета',
    featureOfflineDesc:
      'При обрыве связи касса не останавливается: таймер идёт, действия сохраняются и отправляются при восстановлении связи.',
    featureUpdates: 'Обновляется само',
    featureUpdatesDesc: 'Когда выходит новая версия, программа скачивает и устанавливает её сама.',
    featureGuard: 'Защита от случайного закрытия',
    featureGuardDesc: 'Если есть неотправленные действия, программа предупредит перед закрытием.',

    requirements: 'Требования',
    reqWin: 'Windows 10 или новее (64-бит)',
    reqMac: 'macOS 11 или новее',
    reqLinux: 'AppImage — большинство современных дистрибутивов',

    platformWin: 'Windows',
    platformMac: 'macOS',
    platformLinux: 'Linux',

    backHome: 'На главную',
    openApp: 'Открыть в браузере',
  },
};
