/** Superadmin — desktop dastur relizlarini boshqarish */
export default {
  uz: {
    title: 'Desktop relizlari',
    subtitle: 'O‘rnatgichlarni yuklang va nashr eting — /download sahifasi shundan boqiladi',

    upload: 'Reliz yuklash',
    file: 'O‘rnatgich fayli',
    dropHere: 'Faylni shu yerga tashlang yoki bosing',
    fileRequired: 'Fayl tanlanmagan',
    uploaded: 'Reliz yuklandi',
    uploadError: 'Reliz yuklanmadi',
    loadError: 'Relizlar ro‘yxatini olib bo‘lmadi',

    versionHint: 'desktop/package.json dagi "version" bilan bir xil bo‘lishi SHART',
    versionInvalid: 'Format: 1.0.1',
    notesUz: 'O‘zgarishlar (uz)',
    notesRu: 'O‘zgarishlar (ru)',

    colVersion: 'Versiya',
    colPlatform: 'Tizim',
    colSize: 'Hajmi',
    colStatus: 'Holat',
    colDownloads: 'Yuklab olishlar',
    colDate: 'Sana',

    pf_win: 'Windows',
    pf_mac: 'macOS',
    pf_linux: 'Linux',

    published: 'Nashr etilgan',
    draft: 'Nashr etilmagan',
    publish: 'Nashr etish',
    unpublish: 'Nashrdan olish',
    deleted: 'Reliz o‘chirildi',
    deleteConfirm: 'Reliz o‘chirilsinmi?',
    deleteHint: 'Fayl serverdan butunlay o‘chadi. O‘rnatilgan dasturlar ishlayveradi.',

    empty: 'Hali birorta reliz yuklanmagan',
    emptyHint:
      '/download sahifasi bo‘sh ko‘rinishi shuning uchun. Birinchi o‘rnatgichni yuklab, nashr eting.',

    howToTitle: 'Yangi versiya chiqarish',
    howTo1: '1. desktop/package.json dagi "version" ni oshiring (masalan 1.0.1)',
    howTo2: '2. desktop papkasida: npm run dist:win → release/ ichida .exe hosil bo‘ladi',
    howTo3:
      '3. Shu yerda yuklang → sinab ko‘ring → «Nashr etish». Faqat shundan keyin u /download da va avtomatik yangilanishda paydo bo‘ladi.',
  },
  ru: {
    title: 'Релизы для ПК',
    subtitle: 'Загрузите и опубликуйте установщики — страница /download берёт данные отсюда',

    upload: 'Загрузить релиз',
    file: 'Файл установщика',
    dropHere: 'Перетащите файл сюда или нажмите',
    fileRequired: 'Файл не выбран',
    uploaded: 'Релиз загружен',
    uploadError: 'Не удалось загрузить релиз',
    loadError: 'Не удалось загрузить список релизов',

    versionHint: 'Должна совпадать с "version" в desktop/package.json',
    versionInvalid: 'Формат: 1.0.1',
    notesUz: 'Изменения (uz)',
    notesRu: 'Изменения (ru)',

    colVersion: 'Версия',
    colPlatform: 'Система',
    colSize: 'Размер',
    colStatus: 'Статус',
    colDownloads: 'Загрузок',
    colDate: 'Дата',

    pf_win: 'Windows',
    pf_mac: 'macOS',
    pf_linux: 'Linux',

    published: 'Опубликован',
    draft: 'Не опубликован',
    publish: 'Опубликовать',
    unpublish: 'Снять с публикации',
    deleted: 'Релиз удалён',
    deleteConfirm: 'Удалить релиз?',
    deleteHint: 'Файл будет удалён с сервера. Установленные программы продолжат работать.',

    empty: 'Пока не загружено ни одного релиза',
    emptyHint:
      'Поэтому страница /download пустая. Загрузите первый установщик и опубликуйте его.',

    howToTitle: 'Выпуск новой версии',
    howTo1: '1. Увеличьте "version" в desktop/package.json (например 1.0.1)',
    howTo2: '2. В папке desktop: npm run dist:win → в release/ появится .exe',
    howTo3:
      '3. Загрузите здесь → проверьте → «Опубликовать». Только после этого версия появится на /download и в автообновлении.',
  },
};
