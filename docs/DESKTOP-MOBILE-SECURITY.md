# Desktop va telefon ilovasi

## O‘rnatish

- Windows: `npm --prefix desktop ci`, `npm run desktop:dist`. Natija: `desktop/release/Billiard Club Setup 1.1.0.exe`.
- macOS/Linux: tegishli operatsion tizimda `npm --prefix desktop run dist`. macOS imzolash/notarizatsiya Apple hisobini talab qiladi.
- Android: HTTPS saytdagi `/download` → **Ilovani o‘rnatish**, yoki Chrome menyusidagi shu amal.
- iPhone/iPad: Safari → **Ulashish** → **Bosh ekranga qo‘shish**.
- Mobil variant PWA: bu APK yoki App Store binar fayli emas. Hisob, obuna, ma’lumotlar va huquqlar server bilan umumiy.
- Birinchi kirish internet bilan bajariladi. Oflayn qobiq faqat production buildda yaratiladi; Vite development serveri service worker o‘rnatmaydi.
- Client build/test uchun Node.js **22.12+** kerak. CI Node 22 ishlatadi.

## Obuna va internet uzilishi

Serverdagi SubscriptionGuard har bir himoyalangan so‘rovni bazadagi joriy klub holati bilan tekshiradi. Muddatga teng vaqt ham tugagan hisoblanadi. Guard eskirgan o‘qish asosida status yozmaydi: parallel uzaytirishni bekor qilib yubormaydi.

Oflayn litsenziya ES256 bilan imzolanadi: versiya, foydalanuvchi ID, rol, klub ID, holat, berilgan vaqt, obuna tugashi va ruxsat tugashi. Oflayn ruxsat **24 soat yoki obuna tugashi — qaysi biri oldin bo‘lsa** o‘shangacha amal qiladi. Muddatsiz obunaga ham 24 soatlik qayta tekshirish qoidası qo‘llanadi. Eski v1 ruxsatnomadan keyin internet bilan bir marta kirish kerak.

Yo‘q, buzilgan, eskirgan, begona foydalanuvchiga tegishli yoki noto‘g‘ri formatdagi ruxsatnoma oflayn ishlashga ruxsat bermaydi. Snapshotdagi rol yoki klubni almashtirish imzolangan ruxsatnomaga mos kelmaydi. Superadmin paneli oflayn tiklanmaydi.

Ochiq ilovada har soniya, fokus qaytganda va sahifa ko‘rinishi o‘zgarganda muddat tekshiriladi. Onlaynda profil har 60 soniyada va ulanish qaytganda yangilanadi. Server vaqti, monoton vaqt va diskdagi vaqt chegarasi ishlatiladi. Soat orqaga o‘zgartirilsa internet orqali tekshirish talab etiladi. Yangi oflayn amal navbatga yozilishidan oldin ham litsenziya tekshiriladi; faqat UI tugmasini yashirish bilan cheklanilmaydi.

**Chegara:** internetsiz qurilma serverda yangi qo‘yilgan blok, xodim o‘chirilishi yoki muddat qisqartirilishini darhol bilolmaydi. Bu o‘zgarishlar aloqa tiklanganda, eng kechi oflayn ruxsat tugaganda kuchga kiradi. To‘liq lokal disk/OS va ilova kodini boshqaradigan hujumchi yoki disk snapshotini qaytarish qarshisida mutlaq oflayn kafolat yo‘q. Darhol bekor qilish zarur bo‘lsa doimiy onlayn rejim kerak.

## Ma’lumotlarni saqlash

- Oflayn navbat IndexedDB tranzaksiyasi muvaffaqiyatli tugagandan keyingina saqlangan hisoblanadi. Kvota/disk xatosi foydalanuvchiga ko‘rsatiladi.
- Replay FIFO tartibda va o‘zgarmaydigan Idempotency-Key bilan bajariladi. Web Locks mavjud muhitda tablar orasida bitta replay ishlaydi.
- Server ID xaritasi va navbatdan o‘chirish bitta qat’iy tranzaksiyada. Commit bo‘lmasa amal navbatda qoladi va aynan o‘sha kalit bilan qayta yuboriladi.
- Account o‘zgarsa keyingi amal eski account nomidan yuborilmaydi. Logout navbatni o‘chirmaydi, faqat shu foydalanuvchi qayta kirgach davom ettiriladi.
- Obuna tugashi ma’lumotlarni o‘chirmaydi. Serverga yuborilmagan amallar qurilmada qoladi; server amaldagi huquqlarni qayta tekshiradi.
- `/download` sahifasida xotira, oflayn qobiq, ruxsat muddati va yuborilmagan amallar soni ko‘rsatiladi. Doimiy brauzer xotirasini so‘rash tugmasi mavjud; brauzer rad qilishi mumkin.
- PWA ma’lumotlari ilova xotirasini qo‘lda tozalashdan, qurilma yo‘qolishidan yoki OS profilini o‘chirishdan himoyalanmaydi. Sinxronizatsiya va server PostgreSQL zaxira nusxalari baribir zarur. `persist()` zaxira nusxa emas.
- Lokal biznes ma’lumotlari IndexedDBda saqlanadi; ular uchun alohida ilova darajasidagi shifrlash kiritilmagan. Qurilmada OS hisobi, ekran qulfi va disk shifrlashdan foydalaning. Shu sababli butun mahsulot MASVS bo‘yicha sertifikatlangan deb hisoblanmaydi.

## Desktop chegaralari

Electron 44.10.0; renderer sandbox, context isolation, Node integratsiyasi o‘chirilgan. Packaged build faqat HTTPS manzilni ochadi. HTTP faqat developmentdagi loopback uchun. Tashqi OS protokollari va ixtiyoriy yangi oynalar bloklanadi. IPC jo‘natuvchining oynasi, asosiy frame va origin tekshiriladi. Node/inspector muhit parametrlari va RunAsNode fuses o‘chirilgan; ASAR integrity va faqat ASARdan yuklash yoqilgan.

O‘rnatilgan dastur server manzilini fayl (`config.json`) yoki muhit o‘zgaruvchisidan olmaydi: manzil yig‘ishda `package.json` → `billiardclubServer` orqali beriladi, development rejimida esa eski yo‘llar qoladi. Dastur `/login` dan ochiladi; landing, ro‘yxatdan o‘tish va yuklab olish sahifalari dastur ichida kirish yoki ish ekraniga buriladi. `--remote-debugging-port/pipe`, `--inspect*`, `--js-flags`, `--disable-web-security`, sertifikat xatolarini e’tiborsiz qoldirish, `--proxy-server`/`--host-rules`, `--user-data-dir`, `--load-extension`, `--no-sandbox` kabi parametrlar bilan ishga tushirilsa dastur xabar berib yopiladi (`desktop/security.js`).

## Android chegaralari

Capacitor qobig‘i faqat HTTPS serverni ochadi (cleartext va mixed content o‘chirilgan) va `/login` dan boshlaydi. WebView’da `file://` kirish va fayl URL’laridan boshqa manbalarga kirish o‘chirilgan. `allowBackup`/`fullBackupContent` = false va `data_extraction_rules.xml` ilova ma’lumotlarini Google zaxira nusxasidan va qurilmadan qurilmaga ko‘chirishdan chiqarib qo‘yadi. APK bitta release kaliti bilan imzolanadi, shuning uchun boshqa kalit bilan imzolangan nusxa ilova ustiga o‘rnatilmaydi.

Installer yaratish uni avtomatik ravishda nashr qilmaydi. Ishlab chiqarish uchun Windows publisher sertifikati va macOS notarizatsiya alohida kerak; SHA-512 checksum publisher imzosining o‘rnini bosmaydi. Relizni serverga joylashdan oldin imzo holatini tekshiring.

## Tekshirish

`npm test`, `npm run typecheck`, `npm run build`, `npm run test:integration`, `npm run desktop:check`.

Qo‘lda: onlayn login → stollarni ochish → internetni uzish → sahifani qayta ochish → muddat chegarasida bloklanish → internet va obunani tiklash. Navbatni yozish/commit xatosi, boshqa account, buzilgan litsenziya va soatni orqaga surish alohida testlanadi. Android/iPhone o‘rnatilishi tegishli haqiqiy qurilmada release oldidan tekshiriladi.

Tayanch manbalar: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [OWASP MASVS](https://mas.owasp.org/MASVS/), [MDN installable PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

## 2026-10-12 tekshiruv natijasi

- 93 client, 38 server, 23 PostgreSQL integration, 8 bridge va 3 desktop security testi o‘tdi (jami 165).
- Client/server build va typecheck, Windows NSIS paketlash muvaffaqiyatli.
- Chromium + haqiqiy lokal server/bazada: oflayn amal, qayta ochish, bir martalik replay, tabiiy obuna tugashi, oflayn blokdan keyin qayta ochish, server 403, navbatning saqlanishi, uzaytirish va soat rollback tekshirildi. Bular API mock bilan bajarilmagan.
- 320/390/1440 px brauzer tekshiruvi; iPhone user-agent o‘rnatish yo‘riqnomasi. Haqiqiy Android/iPhone qurilmalarida install lifecycle hali tekshirilmagan.
- Electron 1.1.0 lokal serverga ochildi; sandbox/context isolation va rendererda Node yo‘qligi tekshirildi. Packaged exe fuses ham o‘qib tekshirildi.
- `npm audit --omit=dev`: client/server/desktop — 0 ma’lum zaiflik. Desktop builder development zanjirida `sprintf-js` orqali 8 ta moderate audit yozuvi qoladi; bu paketlar o‘rnatgichning runtime tarkibiga kirmaydi. Audit mustaqil pentest yoki sertifikat o‘rnini bosmaydi.
- Windows installer Authenticode holati: **NotSigned**. macOS/Linux paketi bu Windows mashinada yaratilmagan. Ushbu o‘zgarishlar productionga deploy qilinmagan.

## 2026-10-30 tekshiruv natijasi (Windows 1.3.2, Android 1.2.1)

- Android user-agent bilan `/`, `/register`, `/download`, `/?landing` — barchasi `/login` ga tushdi; kirish sahifasida ro‘yxatdan o‘tish havolasi yo‘q. Oddiy brauzerda landing va ro‘yxatdan o‘tish o‘zgarishsiz.
- APK 1.2.1: versionCode 10201, imzo sertifikati oldingi relizlar bilan bir xil, manifestda backup qoidalari, `capacitor.config.json` da `appStartPath: /login`.
- Paketlangan `Billiard Club.exe --remote-debugging-port=9333`: xato oynasi chiqdi, port ochilmadi, jarayon yopildi. `app.asar` ichida server qulfi va `/login` boshlanishi tekshirildi.
- Windows installer Authenticode holati hali ham **NotSigned**: yangilanishlar faqat `latest.yml` dagi SHA-512 va HTTPS bilan himoyalangan. Publisher sertifikati sotib olinib `win.publisherName` sozlansa, electron-updater yangilanish imzosini ham tekshiradi.
