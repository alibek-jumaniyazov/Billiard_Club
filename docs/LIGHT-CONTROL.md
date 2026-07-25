# Stol chiroqlarini avtomatik boshqarish — apparat va o'rnatish qo'llanmasi

> Ushbu hujjat **klub egasi** uchun ham, **montajchi/elektrik** uchun ham yozilgan.
> Birinchi qism (1–3) — nima sotib olish kerakligi haqida, ikkinchi qism (4–5) — montaj va sozlash,
> uchinchi qism (6–9) — kundalik ishlatish, nosozliklar va xarajatlar.
>
> **Barcha narxlar — taxminiy, 2026 yil holatiga ko'ra**, AQSh dollarida, jihozning o'zi uchun
> (yetkazib berish, bojxona va montaj ishi alohida). Mahalliy bozorda narx 20–40% farq qilishi mumkin.

---

## 0. Eng muhimi — bu funksiya ixtiyoriy

- Chiroq boshqaruvi butunlay **qo'shimcha modul** va standart holatda **o'chiq** (opt-in).
- U yoqilmagan bo'lsa, dastur bugungidek — aynan bir xil — ishlaydi.
- Yoqilgan bo'lsa ham, chiroqdagi har qanday xato (rele javob bermadi, internet uzildi, agent o'chdi)
  **hech qachon** o'yin boshlash / pauza / transfer / yakunlash va pul hisobiga ta'sir qilmaydi.
  Kassir bunday holatni umuman sezmaydi — dasturda faqat kichik "chiroq holati noma'lum" belgisi chiqadi.

---

## 1. Umumiy g'oya va oqim sxemasi

### 1.1 G'oya bir jumlada

Dasturdagi sessiya holati chiroqning **"kerakli holati" (desired state)** ni belgilaydi;
klubda turgan kichik dastur (**bridge agent**) shu kerakli holatni serverdan o'qib olib,
lokal tarmoqdagi **relega** oddiy HTTP so'rov yuboradi va chiroqni yoqadi/o'chiradi.

Alohida "buyruqlar navbati" yo'q. Server har safar bazadagi joriy holatdan kelib chiqib
kerakli holatni qayta hisoblaydi. Shuning uchun sessiya tranzaksiyalariga umuman tegilmagan.

### 1.2 Nima uchun "bridge agent" kerak?

Dastur bulutda (`billiardclub.uz`) turadi, relelar esa klubning **lokal tarmog'ida** (`192.168.x.x`),
router (NAT) ortida. Bulutdagi server `192.168.1.51` ga to'g'ridan-to'g'ri chiqa olmaydi.

Yechim: agent **o'zi** serverga chiqadi (chiquvchi HTTPS). Ya'ni:

- router sozlash **kerak emas**
- port forwarding **kerak emas**
- statik "oq" IP **kerak emas**
- klub tarmog'iga tashqaridan hech kim kira olmaydi (xavfsizroq)

Agar server klub bilan **bitta tarmoqda** bo'lsa (on-premise o'rnatma), `DIRECT` rejimi ishlatiladi —
u holda agent kerak emas, server relega o'zi murojaat qiladi.

### 1.3 Oqim sxemasi (o'yin boshlash)

```
  [1] KASSA                 [2] BULUT SERVER              [3] KLUBDAGI BRIDGE AGENT
  brauzer                   billiardclub.uz               doim yoqiq kompyuter
  +---------------+         +---------------------+       +----------------------+
  | "Boshlash"    |  HTTPS  | sessions: yangi     |       | GET /api/bridge/state|
  |  bosildi      | ------->| yozuv, status =     |       |      ?v=<version>    |
  +---------------+         | 'active'            |       | (uzun-polling 25 s)  |
                            | (tranzaksiya)       |       +----------+-----------+
                            +----------+----------+                  ^
                                       |                             |
                                       v                             |
                            +---------------------+                  |
                            | desired state qayta |  version         |
                            | hisoblanadi:        |  o'zgardi -->----+
                            | stol #3 -> YONIQ    |  (javob darhol
                            | version = sha1(...) |   qaytadi)
                            +---------------------+                  |
                                                                     v
                                                          +----------------------+
                                                          | Lokal HTTP so'rov:   |
                                                          | http://192.168.1.51/ |
                                                          |  rpc/Switch.Set?     |
                                                          |  id=0&on=true        |
                                                          +----------+-----------+
                                                                     |
                                                                     v
                                                          +----------------------+
                                                          |   STOL #3 CHIROG'I   |
                                                          |       Y O N D I      |
                                                          +----------------------+
                                                                     |
                            +---------------------+   POST /api/bridge/report     |
                            | tables.lightState   |<------------------------------+
                            | = 'on', lightSyncedAt|   { tableId, ok, on }
                            +---------------------+
```

**Yakunlash / bekor qilishda** — aynan teskarisi: sessiya `completed`/`cancelled` bo'ladi →
desired `false` → agent relega `off` yuboradi → chiroq o'chadi.

**Kechikish:** odatda **1 soniyadan kam**. Chunki agent javobni kutib turadi (uzun-polling),
server esa holat o'zgarishi bilan javobni darhol qaytaradi — qayta so'rovni kutib o'tirish shart emas.

### 1.4 Tarmoq sxemasi

```
        INTERNET
            |
            |  chiquvchi HTTPS (443)  — kiruvchi port OCHILMAYDI
            |
   +--------+---------+
   |   Wi-Fi ROUTER   |  <-- DHCP reservation: har relega doimiy IP
   +--+-----+------+--+
      |     |      |
      |     |      +-------------------+
      |     |                          |
  +---+---+ |                    +-----+------+
  | KASSA | |                    | BRIDGE     |  Node agent
  |  PC   | |                    | kompyuter  |  (kassa PC ham bo'lishi mumkin)
  +-------+ |                    +-----+------+
            |                          |  lokal HTTP (80/8080)
   +--------+---------+----------------+-----------------+
   |                  |                                  |
+--+---+          +---+--+                          +----+-+
|RELE 1|          |RELE 2|          . . .            |RELE N|
|192.  |          |192.  |                           |192.  |
|168.  |          |168.  |                           |168.  |
|1.51  |          |1.52  |                           |1.5N  |
+--+---+          +--+---+                           +--+---+
   |                 |                                  |
 STOL 1            STOL 2                             STOL N
 chirog'i          chirog'i                           chirog'i
```

---

## 2. Uchta apparat varianti

### Variant A — har stolga alohida Wi-Fi rele (**eng oson**)

**Kimga mos:** 1–6 stolli klub; allaqachon tayyor bo'lgan, chiroq simlari devor/shift ichida
tortilgan zal; shchitni qayta yig'ishni istamaganlar; ijaradagi bino.

Rele har stolning **yorug'lik nuqtasiga** (chiroq armaturasi yoniga, osma shift ustiga yoki
devordagi vyklyuchatel qutisiga) o'rnatiladi — u yerda faza ham, nol ham bor.

**Kerakli jihozlar (6 stolli klub misolida):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | Wi-Fi rele | **Shelly 1 Mini Gen3** (16A, kichik, yorug'lik qutisiga sig'adi) | 6 | 13–16 $/dona |
| | *yoki* | **Shelly Plus 1 / Shelly 1 Gen3** (16A, kattaroq, ishonchli) | 6 | 16–18 $/dona |
| | *yoki* | **Sonoff MINI R4** + **Tasmota** proshivkasi (arzon variant) | 6 | 8–11 $/dona |
| 2 | Montaj qutisi (agar joy yetmasa) | 68 mm chuqurlashtirilgan podrozetnik | 6 | 1–2 $/dona |
| 3 | Klemma | WAGO 221 (3/5 tirqishli) | 20–30 | 0.4–0.8 $/dona |
| 4 | Sim (rele – chiroq oralig'i) | ПВС 3x1.5 mm² (qisqa bo'laklar) | 15–20 m | 0.5–0.8 $/m |

**8 stol uchun jihoz: taxminan 120–150 $** (faqat relelar), mayda materiallar bilan **~160–185 $**.

**Afzalliklari:**
- Eng oson va eng tez montaj — bir stolga 20–40 daqiqa
- Devor ochish, shtroblash, yangi kabel tortish **kerak emas**
- Bitta rele buzilsa — faqat bitta stol ta'sirlanadi
- Har relening o'zida quvvat o'lchash bo'lgan modeli ham bor (Shelly Plus 1PM) — chiroq yonganini
  tok bo'yicha ham tekshirish mumkin

**Kamchiliklari:**
- Wi-Fi ga bog'liq: 8–12 ta qurilma bir routerga ulanadi, zal katta bo'lsa signal masalasi chiqadi
- Relelar tarqoq joylashadi — biriga xizmat ko'rsatish uchun shiftga/armaturaga chiqish kerak
- Har biriga alohida IP berish va nazorat qilish kerak
- 10+ stolda arzonroq bo'lmay qoladi (B variantiga qaraganda)

---

### Variant B — markaziy DIN-rele shchiti (**6+ stol uchun TAVSIYA**)

**Kimga mos:** 6 va undan ko'p stolli klub; yangi qurilayotgan yoki kapital ta'mirdagi zal;
"hammasi bir joyda, tartibli bo'lsin" deydiganlar.

Barcha relelar **bitta elektr shchitida** DIN reykaga o'rnatiladi. Har stolga shchitdan
alohida `3x1.5 mm²` kabel tortiladi.

**Kerakli jihozlar (8 stolli klub misolida):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | DIN rele (4 kanal) | **Shelly Pro 4PM** (4x16A, **LAN** + Wi-Fi, quvvat o'lchash) | 2 | 130–150 $/dona |
| | *arzonroq alternativa* | 8-kanalli Ethernet rele plata (LAN, HTTP API) | 1 | 35–60 $/dona |
| 2 | Kirish avtomati | 25A, 1P+N | 1 | 5–8 $ |
| 3 | Stol liniyasi avtomatlari | 6A yoki 10A, 1P (har stolga bitta) | 8 | 2–4 $/dona |
| 4 | Shchit (bo'sh korpus) | 24–36 modulli, devorga o'rnatiladigan | 1 | 25–45 $ |
| 5 | Kabel (shchit → stol) | ВВГнг 3x1.5 mm², o'rtacha 15 m/stol | ~120 m | 0.5–0.8 $/m |
| 6 | Kabel kanali / gofra | 20 mm | ~120 m | 0.3–0.5 $/m |
| 7 | Shina, klemma, marker | N va PE shinalari, WAGO, nomerlar | 1 komplekt | 15–25 $ |

**8 stol uchun jihoz: taxminan 420–520 $** (Shelly Pro 4PM bilan) yoki **~230–300 $**
(8-kanalli Ethernet plata bilan) + kabel/montaj materiallari.

**Afzalliklari:**
- **Ethernet (kabel)** bilan ulanadi — Wi-Fi muammosi umuman yo'q, eng ishonchli variant
- Hammasi bitta shchitda: xizmat ko'rsatish, tekshirish, almashtirish oson
- Har stol liniyasida alohida avtomat — himoya to'g'ri qurilgan bo'ladi
- Quvvat o'lchash (Pro 4PM da) — chiroq haqiqatan yonganini vatt bo'yicha bilish mumkin
- Ko'rinishi professional, tekshiruvchi organlarga ko'rsatish oson

**Kamchiliklari:**
- Kabel tortish kerak — ta'mirsiz bino uchun qimmat va noqulay
- Bitta 4-kanalli qurilma buzilsa — birdaniga 4 ta stol ta'sirlanadi
- Boshlang'ich xarajat A variantidan yuqori
- Ish hajmi katta — malakali elektrik va 1–2 kun vaqt kerak

---

### Variant C — o'zi yig'ish (**eng arzon**)

**Kimga mos:** byudjet juda tor bo'lgan klub; yaqinida elektronika biladigan odam bor bo'lsa.
**Elektronikani bilmasangiz — bu variantni tanlamang.**

**Kerakli jihozlar (8 kanal = 8 stol uchun bitta modul):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | Mikrokontroller | **ESP32 DevKit** (yoki NodeMCU ESP8266) | 1 | 5–8 $ |
| 2 | Rele moduli | 8 kanalli **optoizolyatsiyali** rele plata (5V, 10A/250V) | 1 | 8–12 $ |
| 3 | Oziqlantirish | 5V 2A quvvat bloki (yaxshi, arzon "zaryadnik" emas) | 1 | 4–7 $ |
| 4 | Korpus | DIN yoki devor korpusi, ventilyatsiya teshiklari bilan | 1 | 6–12 $ |
| 5 | Mayda | simlar, vintli klemma, pin-konnektor, predoxranitel | 1 komplekt | 4–8 $ |

**Jami: taxminan 27–47 $** (8 ta stolga!) + kabel/avtomat/shchit (B variantidagidek).

**Proshivka:** **Tasmota** (tavsiya — HTTP API tayyor: `/cm?cmnd=Power1%20On`) yoki **ESPHome**.
Dasturda driver sifatida `tasmota` tanlanadi.

**Afzalliklari:**
- Jihoz narxi bo'yicha raqobatchisi yo'q — bir stol ~4–6 $
- To'liq nazorat: kanallar soni, joylashuv, mantiq — hammasi o'zingizda
- Zaxira modul olib qo'yish arzon (yana 30 $)

**Kamchiliklari:**
- **Sertifikatlanmagan qurilma** — sug'urta va tekshiruv nuqtai nazaridan muammo bo'lishi mumkin
- Arzon rele platalarining kontaktlari 2–3 yildan keyin kuyishi mumkin (ayniqsa induktiv yuk bilan)
- Optoizolyatsiyasiz plata olsangiz — ESP qayta yuklanib turadi, chiroq "chirt-chirt" qiladi
- Proshivka, sozlash, xatolarni topish uchun odam kerak
- Kafolat yo'q

---

### Variantlarni solishtirish

| Mezon | A (har stolga rele) | B (markaziy DIN) | C (o'zi yig'ish) |
|---|---|---|---|
| 8 stol uchun jihoz narxi | 120–150 $ | 230–520 $ | 30–50 $ |
| Montaj murakkabligi | Past | Yuqori | O'rta |
| Ishonchlilik | Yaxshi | **Eng yaxshi** | O'rta |
| Ulanish | Wi-Fi | **LAN** (kabel) | Wi-Fi |
| Sertifikat/kafolat | Bor | Bor | **Yo'q** |
| Kengaytirish | Har stol +15 $ | Kanal tugasa +140 $ | Juda arzon |
| Tavsiya | 1–6 stol | **6+ stol** | Faqat mutaxassis bilan |

---

## 3. Har qanday variantda kerak bo'ladigan narsalar

Quyidagilar A, B, C — **uchala variantda ham** zarur:

### 3.1 Doim yoqiq kompyuter (bridge agent uchun)

Agent — juda kichik Node dasturi (RAM ~40 MB, protsessor deyarli band bo'lmaydi).

| Variant | Izoh | Taxminiy narx (2026) |
|---|---|---|
| **Kassaning o'z kompyuteri** | Eng arzon. Sharti: klub ochiq bo'lgan vaqtda **doim yoqiq** turishi, uyquga ketmasligi | 0 $ |
| **Raspberry Pi 4/5 (2–4 GB)** | Jim, kam quvvat sarflaydi (~5 Vt), 24/7 ishlaydi | 35–70 $ (+ karta/blok 10–15 $) |
| **Mini-PC (N100 va o'xshash)** | Eng qulay: Windows/Linux, tez, LAN porti bor | 60–80 $ (ishlatilgani) |

> Agar kassa kompyuteri kechqurun o'chirilsa — chiroqlar **oxirgi holatida qolib ketadi**.
> Shuning uchun 24/7 ishlaydigan alohida qurilma (Pi yoki mini-PC) **tavsiya etiladi**.

### 3.2 Wi-Fi router va DHCP reservation

- Router relelar bilan bitta tarmoqda bo'lishi shart.
- **Har relega doimiy IP** bering: router sozlamalarida `DHCP reservation` (yoki `Static DHCP`,
  `Address Reservation` deb ataladi) — relening MAC manzilini kiritib, unga doimiy IP biriktiriladi.
- **Buni albatta qiling.** Aks holda elektr o'chib yonganda IP lar almashib ketadi va
  1-stolning tugmasi 5-stolning chirog'ini yoqib qo'yadi.
- Tavsiya: relelarga `192.168.1.51 … 192.168.1.70` oralig'ini ajratib qo'ying (DHCP pooldan tashqarida).
- Narx: mavjud router yetadi; yangisi kerak bo'lsa **25–60 $**.

### 3.3 Internet

- Bulut server bilan aloqa uchun. Tezlik ahamiyatsiz — trafik juda kam (soatiga bir necha KB).
- **Internet uzilsa:** chiroqlar **oxirgi holatida qoladi** (yonganlari yonib turadi, o'chganlari o'chiq).
  Kassir devordagi qo'l vyklyuchateli bilan boshqarishi mumkin. Internet qaytishi bilan agent
  serverdan kerakli holatni olib, hammasini avtomatik to'g'rilaydi.

### 3.4 UPS (uzluksiz quvvat manbai) — **tavsiya**

- Router + bridge kompyuter uchun. 400–650 VA yetarli (20–40 daqiqa ishlaydi).
- Narx: **40–90 $**.
- Chiroqlarning o'zini UPS ga ulash **shart emas** — elektr yo'q bo'lsa chiroq baribir yonmaydi.

### 3.5 LITSENZIYALI ELEKTRIK — **MAJBURIY**

> **220 V bilan bog'liq barcha ishlar faqat malakali, litsenziyaga ega elektrik tomonidan
> bajarilishi shart.**
>
> - Ishni boshlashdan oldin **avtomatni o'chiring** va indikator/multimetr bilan kuchlanish
>   yo'qligini tekshiring.
> - "O'zim ham qilaman" degan fikr — hayot va bino xavfsizligi masalasi. Bu bo'limdagi
>   sxemalar elektrikka **topshiriq** sifatida beriladi, o'z-o'zicha bajarish uchun emas.
> - Ishlatiladigan barcha jihoz (rele, avtomat, kabel) sertifikatlangan bo'lsin.
>
> Elektrik ishi uchun taxminiy narx (2026): **A variant 10–20 $/stol**, **B variant 25–40 $/stol**
> (kabel tortish bilan).

---

## 4. Elektr ulanish qoidalari

### 4.1 Asosiy qoidalar

1. **Rele FAZANI (L) uzadi, nolni (N) EMAS.**
   Nol uzilsa chiroq o'chgan bo'lsa ham armaturada faza qolib ketadi — bu o'lim xavfi.
   Elektrik faza va nolni multimetr/indikator bilan aniqlab olsin, rangga ishonmasin.

2. **Relening nominal toki chiroq quvvatidan katta bo'lsin.**

   | Stol chirog'i quvvati | Tok (220 V da) | Nima kerak |
   |---|---|---|
   | 100–300 Vt (odatiy LED) | 0.5–1.4 A | **10A rele yetarli** (zaxira ~7 barobar) |
   | 300–1000 Vt | 1.4–4.5 A | 16A rele |
   | 1000–2000 Vt | 4.5–9 A | 16A rele, kabel 1.5 mm² dan kam bo'lmasin |
   | **2000 Vt dan ortiq** | 9 A dan ortiq | **Kontaktor qo'shiladi**: rele kontaktorni, kontaktor chiroqni boshqaradi |

   > LED chiroqlarda **ishga tushish toki (inrush current)** nominaldan 5–20 barobar katta bo'ladi
   > (juda qisqa vaqtga). Shuning uchun zaxira bilan olish shart — 100 Vt LED ga 10A rele.
   > Bir kanalga ko'p LED drayver ulansa, inrush yig'ilib rele kontaktini kuydiradi.

3. **Har stol liniyasiga alohida avtomat (6–10A)** — tavsiya (B variantida majburiy).
   Bir stolda qisqa tutashuv bo'lsa, butun zal emas, faqat o'sha stol o'chadi.

4. **Devordagi qo'l vyklyuchateli SAQLANADI.**
   Vyklyuchatel relening **SW** (switch input) kirishiga ulanadi va rele sozlamasida
   **"detached" (ajratilgan)** rejimi yoqiladi. Bu degani:
   - vyklyuchatel bosilganda rele holati o'zgaradi (chiroq qo'lda yoqiladi/o'chiriladi)
   - lekin server/internet uzilganda ham **qo'lda boshqarish ishlaydi** — bu zaxira yo'l
   - Shelly da: `Settings → Input/Output settings → Detached switch` (Gen2/Gen3 da
     `Input mode: detached`).

   > Agar vyklyuchatel `edge`/`toggle` rejimida qolsa, u fizik holatga bog'lanib qoladi va
   > server buyrug'i bilan qarama-qarshilik chiqadi. **Detached** — to'g'ri tanlov.

5. **Rele uchun N (nol) sim yorug'lik nuqtasida bo'lishi SHART.**
   Shelly va shunga o'xshash relelar o'zi 220 V dan oziqlanadi va unga **faza ham, nol ham** kerak.
   Eski uylarda vyklyuchatel qutisida faqat faza bo'ladi — u holda:
   - nolni yorug'lik nuqtasidan (armaturadan) tortish kerak, **yoki**
   - releni vyklyuchatel qutisiga emas, **armatura yoniga** (shift ustiga) o'rnatish kerak, **yoki**
   - B variantiga (markaziy shchit) o'tish kerak — u yerda nol doim bor.

6. **Yer (PE)** simi armaturaga uzluksiz ulanadi, relening kommutatsiyasidan o'tmaydi.

7. **Rele issiqlik chiqaradi.** Metall germetik qutiga tiqmang, ventilyatsiya bo'lsin.
   Yonida boshqa issiq jihoz (drayver, transformator) bo'lmasin.

### 4.2 Ulanish sxemasi (bitta stol, A variant)

```
 SHCHIT                          YORUG'LIK NUQTASI (shift ustida / armatura yonida)
 +---------------+
 |               |    L (faza)      +-----------------------------+
 |  AVTOMAT      |----------------->| L in                        |
 |  6-10A  --o/o |                  |                             |
 |               |    N (nol)       |        R E L E              |
 |  N shina      |----------------->| N        (Shelly 1 Mini)    |
 |               |                  |                             |
 |  PE shina     |    PE (yer)      |                    L out    |----+
 |               |------+           |                             |    |
 +---------------+      |           |  SW                         |    |
                        |           +---+-------------------------+    |
                        |               |                              |
                        |               | devordagi                    |
                        |               | QO'L VYKLYUCHATELI           |
                        |               | (detached rejim)             |
                        |          +----+----+                         |
                        |          |   o/o   |----> L ga qaytadi       |
                        |          +---------+                         |
                        |                                              |
                        |                    +-------------------------+
                        |                    |
                        |            +-------v---------+
                        +----------->| PE   L      N   |
                                     |                 |  <-- N to'g'ridan-to'g'ri
                                     |  STOL CHIROG'I  |      shchitdan keladi
                                     |   (LED, 150 Vt) |      (releda uzilmaydi!)
                                     +-----------------+
```

**Qisqacha:** faza avtomatdan → relening `L in` iga; relening `L out` idan → chiroqqa.
Nol shchitdan to'g'ridan-to'g'ri chiroqqa (va rele oziqlanishi uchun releda ham nol bo'ladi).
Vyklyuchatel `SW` kirishiga — u chiroqni uzmaydi, faqat relega "signal" beradi.

### 4.3 Ulanish sxemasi (markaziy shchit, B variant)

```
 +===================== SHCHIT =======================+
 |                                                    |
 |  KIRISH                                            |
 |  25A --o/o--+--------------------------------+     |
 |             |                                |     |
 |         +---v----+  +--------+  +--------+  ...    |
 |         | 10A #1 |  | 10A #2 |  | 10A #3 |         |   <-- har stolga avtomat
 |         +---+----+  +---+----+  +---+----+         |
 |             |           |           |              |
 |         +---v-----------v-----------v----------+   |
 |         |  L1     L2     L3     L4             |   |
 |         |                                      |   |
 |         |     S H E L L Y   P R O   4 P M      |   |   <-- LAN kabeli bilan
 |         |          (DIN, 4 kanal)              |   |       routerga
 |         |                                      |   |
 |         |  O1     O2     O3     O4    N   PE   |   |
 |         +---+------+------+------+----+---+----+   |
 |             |      |      |      |    |   |        |
 +=============|======|======|======|====|===|========+
               |      |      |      |    |   |
            3x1.5 mm2 kabel (L, N, PE) har stolga
               |      |      |      |
            +--v--+ +-v---+ +v----+ +v----+
            |STOL1| |STOL2| |STOL3| |STOL4|
            +-----+ +-----+ +-----+ +-----+
```

Har stolning devor vyklyuchateli shchitgacha alohida signal simi bilan keladi va
Pro 4PM ning `SW1..SW4` kirishlariga ulanadi (past kuchlanishli emas — 220 V signal, sxemani
elektrik qurilma pasportiga qarab bajarsin).

---

## 5. Bosqichma-bosqich o'rnatish (chek-list)

### 5-A bosqich. Relelarni montaj qilish

- [ ] Elektrikni chaqiring, uning bilan har stol uchun rele qayerga o'rnatilishini belgilang
- [ ] **Avtomatlarni o'chiring**, kuchlanish yo'qligini tekshiring
- [ ] Relelarni 4-bo'limdagi sxema bo'yicha ulang (faza uziladi, nol emas)
- [ ] Har relega **stol raqamini yozib** yopishtiring (`STOL 3`) — keyin juda asqotadi
- [ ] Vyklyuchatellarni `SW` kirishiga ulang
- [ ] Avtomatlarni yoqing, har relening indikatori yonganini tekshiring

### 5-B bosqich. Wi-Fi / LAN ga ulash

- [ ] Rele o'z Wi-Fi nuqtasini tarqatadi (masalan `ShellyMini1G3-XXXX`) — telefondan unga ulaning
- [ ] Brauzerda `192.168.33.1` ni oching → klub Wi-Fi tarmog'ini tanlang, parolni kiriting
- [ ] Rele klub tarmog'iga ulanadi va yangi IP oladi
- [ ] Rele sozlamalarida **`Input mode: detached`** ni yoqing (4.1-bo'lim, 4-qoida)
- [ ] Rele veb-interfeysiga **parol qo'ying** (yoki hech bo'lmaganda alohida VLAN/mehmon tarmoq)
- [ ] Rele proshivkasini yangilang (Shelly: `Settings → Firmware update`)

### 5-C bosqich. Har relega doimiy IP berish

- [ ] Router admin panelini oching → `DHCP → Address Reservation` (nom har routerda har xil)
- [ ] Har relening MAC manzilini toping (rele veb-interfeysida yoki korpus stikerida yozilgan)
- [ ] Biriktiring, masalan:

  | Stol | Rele MAC | IP |
  |---|---|---|
  | 1 | `A4:CF:12:...:01` | `192.168.1.51` |
  | 2 | `A4:CF:12:...:02` | `192.168.1.52` |
  | 3 | `A4:CF:12:...:03` | `192.168.1.53` |

- [ ] Relelarni qayta yuklang va IP lar to'g'ri berilganini tekshiring
- [ ] **Bu jadvalni qog'ozga chop etib shchit yoniga osib qo'ying**

### 5-D bosqich. Brauzerdan sinash (dasturga tegmasdan)

Bridge kompyuterdan (yoki shu tarmoqdagi istalgan kompyuterdan) brauzerni oching va
quyidagi manzilni kiriting — chiroq **yonishi** kerak:

| Driver | Yoqish (ON) | O'chirish (OFF) |
|---|---|---|
| `shelly_gen2` (Plus/Pro/Gen3) | `http://192.168.1.51/rpc/Switch.Set?id=0&on=true` | `...&on=false` |
| `shelly_gen1` (eski Shelly 1) | `http://192.168.1.51/relay/0?turn=on` | `http://192.168.1.51/relay/0?turn=off` |
| `tasmota` (Sonoff/ESP32) | `http://192.168.1.51/cm?cmnd=Power1%20On` | `http://192.168.1.51/cm?cmnd=Power1%20Off` |
| `http` (boshqa qurilmalar) | qurilma pasportidagi o'z URL i | o'z URL i |

- [ ] Har stol uchun ON va OFF ni brauzerdan sinab ko'ring
- [ ] **Bu bosqich ishlamasa, dasturda ham ishlamaydi** — avval shu yerni to'g'rilang
  (IP xato, tarmoq boshqa, parol qo'yilgan, kanal raqami boshqa)

### 5-E bosqich. Bridge agentni o'rnatish

- [ ] Doim yoqiq kompyuterni tanlang (kassa PC yoki Raspberry Pi / mini-PC)
- [ ] Node.js 20+ o'rnating
- [ ] Agentni o'rnatish va avtoyuklashga qo'yish bo'yicha to'liq yo'riqnoma: **[`bridge/README.md`](../bridge/README.md)**
- [ ] Agentni **xizmat** (service) sifatida qo'ying, kompyuter yonganda o'zi ishga tushsin:
  - Windows: rejalashtirilgan vazifa (`Task Scheduler`, "At startup", "Run whether user is logged on or not")
  - Linux/Raspberry Pi: `systemd` unit fayli (`Restart=always`)
- [ ] Kompyuter **uyquga ketmasin**: Windows da `Power Options → Sleep → Never`

### 5-F bosqich. Dasturda sozlash

- [ ] **Stollar → Chiroq sozlamalari** bo'limini oching
- [ ] Chiroq boshqaruvini **yoqing** (standart holatda o'chiq)
- [ ] Rejimni tanlang:
  - **Bridge** — bulutdagi server (deyarli hamma uchun shu)
  - **Direct** — server klub bilan bir tarmoqda bo'lsa (on-premise)
- [ ] **"Token yaratish"** tugmasini bosing → chiqqan tokenni **darhol nusxa oling**

  > Token faqat **bir marta** ko'rsatiladi. Serverda uning faqat sha256 xeshi saqlanadi.
  > Yo'qotsangiz — yangisini yaratish kerak (eskisi ishlamay qoladi).

- [ ] Tokenni agent sozlamasiga qo'ying — `bridge/.env` faylida:

  ```
  SERVER_URL=https://billiardclub.uz
  BRIDGE_TOKEN=<saytdan olgan tokeningiz>
  ```

- [ ] Agentni qayta ishga tushiring
- [ ] Dasturda bridge holati **"onlayn"** ga o'tganini kuting (bir necha soniya)

### 5-G bosqich. Har stolni sozlash va tekshirish

Har stol uchun **Stollar → (stol) → Chiroq** bo'limida:

- [ ] `driver` — `shelly_gen2` / `shelly_gen1` / `tasmota` / `http` dan birini tanlang
      (`none` = bu stolda chiroq boshqarilmaydi — standart qiymat)
- [ ] `host` — IP (`192.168.1.51`) yoki port bilan (`192.168.1.51:8080`)
- [ ] `channel` — relay kanali, **0 dan boshlanadi** (bir kanalli relelarda `0`;
      Shelly Pro 4PM da `0,1,2,3`; Tasmota da `Power1`=`0`, `Power2`=`1`)
- [ ] `inverted` — rele **NC** (normally closed) ulangan bo'lsa yoqing
- [ ] `auth` — rele veb-interfeysiga parol qo'ygan bo'lsangiz: `foydalanuvchi:parol`
- [ ] `onUrl` / `offUrl` — faqat `driver = http` uchun
- [ ] **"Test"** tugmasini bosing → chiroq bir marta yonib-o'chishi kerak
- [ ] Test muvaffaqiyatsiz bo'lsa — 7-bo'limga qarang

### 5-H bosqich. Haqiqiy sinov

- [ ] Bitta stolda haqiqiy o'yin **boshlang** → chiroq 1 soniya ichida yonsin
- [ ] O'yinni **pauzaga** qo'ying → sozlamaga qarab yonib qoladi yoki o'chadi
- [ ] Boshqa stolga **transfer** qiling → eski stol o'chsin, yangisi yonsin
- [ ] O'yinni **yakunlang** → chiroq o'chsin
- [ ] Bridge kompyuterni **o'chirib** ko'ring → dastur baribir normal ishlashi kerak
      (o'yin boshlanadi, pul hisoblanadi; faqat chiroq holati "noma'lum" bo'ladi)
- [ ] Devor vyklyuchateli bilan **qo'lda** yoqib/o'chirib ko'ring
- [ ] Hammasi joyida bo'lsa — qolgan stollarni ham sozlang

---

## 6. Ishlash rejimlari va qoidalar

### 6.1 Sessiya holati → chiroq holati

| # | Vaziyat | Sozlama | Chiroqning kerakli holati |
|---|---|---|---|
| 1 | Stolda **faol** (`active`) sessiya bor | — | **YONIQ** |
| 2 | Sessiya **pauzada** (`paused`) | `lightOffOnPause = false` *(standart)* | **YONIQ** |
| 3 | Sessiya **pauzada** (`paused`) | `lightOffOnPause = true` | **O'CHIQ** |
| 4 | Sessiya **yakunlangan** (`completed`) | — | **O'CHIQ** |
| 5 | Sessiya **bekor qilingan** (`cancelled`) | — | **O'CHIQ** |
| 6 | Stolda umuman sessiya yo'q | — | **O'CHIQ** |
| 7 | **Qo'lda override faol** (`lightOverrideUntil > hozir`) | — | `lightOverrideOn` **qiymati ustun turadi** |

**Transfer** (bir stoldan boshqasiga ko'chirish) alohida qoida talab qilmaydi: eski stolda faol
sessiya qolmaydi → o'chadi; yangi stolda `active` paydo bo'ladi → yonadi. Ikkalasi ham bitta
`version` o'zgarishida yetkaziladi.

**Rejim hammasidan ustun:** klub rejimi `off` (yoki `direct`) bo'lsa, `GET /api/bridge/state`
**bo'sh** qurilmalar ro'yxatini qaytaradi — agent ishlab tursa ham hech bir relega buyruq
yubormaydi va chiroqlar oxirgi fizik holatida qoladi. Ya'ni panelda rejimni `off` ga o'tkazish
chiroq boshqaruvini **darhol** to'xtatadi (agentni o'chirish yoki tokenni bekor qilish shart emas).

### 6.2 Qo'lda override (vaqtinchalik qo'l boshqaruvi)

Kassir dasturdan istalgan stol chirog'ini **majburan** yoqishi/o'chirishi mumkin
(masalan: tozalash uchun yoqish, yoki sessiya bor bo'lsa ham o'chirish).

- Override ma'lum muddatga beriladi (`lightOverrideUntil`), masalan 30 daqiqa.
- Shu muddat davomida sessiya holati **e'tiborga olinmaydi** — `lightOverrideOn` qiymati ishlaydi.
- Muddat tugashi bilan tizim avtomatik ravishda 6.1-jadvaldagi qoidaga qaytadi.
- Override "abadiy" bo'lmasligi ataylab shunday qilingan: kimdir yoqib qo'yib unutsa,
  chiroq tunda yonib qolmaydi.

### 6.3 Version va sinxronizatsiya

- Server barcha stollarning kerakli holatidan **`version`** (sha1 xesh) hisoblaydi.
- Agent `GET /api/bridge/state?v=<version>` bilan so'raydi:
  - version **o'zgargan** bo'lsa → javob **darhol** qaytadi
  - o'zgarmagan bo'lsa → server javobni **25 soniyagacha ushlab turadi** (har 1000 ms da qayta tekshiradi),
    keyin o'sha version bilan qaytaradi va agent yana so'raydi
- **`forceSyncMs`** (standart **60 000 ms = 1 daqiqa**): version o'zgarmagan bo'lsa ham agent
  har daqiqada holatni relelarga **majburan qayta qo'llaydi**. Bu — rele qayta yuklangan yoki
  kimdir qo'lda o'zgartirib qo'ygan holatlarni o'z-o'zidan to'g'rilaydi.
- Agent har amaldan keyin `POST /api/bridge/report` yuboradi → dasturda har stol uchun
  `lightState` (`on`/`off`/`unknown`), `lightSyncedAt` (oxirgi muvaffaqiyatli vaqt) va
  `lightError` (xato matni) ko'rinadi.

### 6.4 Xatolar hech qachon ishni to'xtatmaydi

| Nima buzildi | Dasturda nima bo'ladi |
|---|---|
| Rele javob bermadi | Sessiya normal ishlaydi; stolda "chiroq xatosi" belgisi chiqadi |
| Bridge agent o'chgan | Sessiya normal ishlaydi; bridge "offlayn" ko'rsatiladi |
| Internet uzilgan | Sessiya normal ishlaydi; chiroqlar oxirgi holatda qoladi |
| Rele IP o'zgargan | Faqat o'sha stol chirog'i sinxronlanmaydi |
| Token noto'g'ri | Agent ulanmaydi; qolgan hamma narsa ishlaydi |

---

## 7. Nosozliklarni bartaraf etish

### 7.1 Dasturda "Bridge offlayn" yozuvi turibdi

**Sabab:** agent ishlamayapti, internet yo'q yoki token noto'g'ri.

1. Bridge kompyuter yoqiqmi? Uyquga ketmaganmi?
2. Agent jarayoni ishlayaptimi?
   - Windows: `Get-Process node` yoki Task Manager
   - Linux: `systemctl status billiard-bridge`
3. Agent loglarida nima yozilgan? `401` bo'lsa → token noto'g'ri (5-F bosqichdan tokenni qayta yarating).
4. Bridge kompyuterdan `https://billiardclub.uz` brauzerda ochiladimi? Ochilmasa — internet muammosi.
5. Antivirus/Windows Defender agentni bloklamaganmi?
6. Agentni qayta ishga tushiring.

### 7.2 Rele javob bermayapti (test xato beradi)

1. Rele ovqatlanish oldayaptimi — indikator yonyaptimi?
2. Rele IP siga brauzerdan kirib ko'ring: `http://192.168.1.51`
3. **Ping** qiling: `ping 192.168.1.51`
   - Javob yo'q → rele tarmoqda emas (Wi-Fi uzilgan yoki IP boshqa)
   - Javob bor, lekin veb ochilmayapti → rele osilib qolgan, quvvatdan uzib-ulang
4. Bridge kompyuter va rele **bitta tarmoqdami**? (mehmon Wi-Fi tarmog'iga ulanib qolmaganmi —
   mehmon tarmog'ida qurilmalar bir-birini ko'rmaydi)
5. Rele veb-interfeysiga parol qo'yilgan bo'lsa, dasturda `auth` maydoni to'ldirilganmi?
   Format: `foydalanuvchi:parol`

### 7.3 IP o'zgarib ketgan (kecha ishlagan, bugun ishlamayapti)

**Eng ko'p uchraydigan nosozlik.** Elektr o'chib yongan yoki router qayta yuklangan.

1. Router panelidan `DHCP client list` ni oching, relening MAC i bo'yicha yangi IP ni toping
2. Vaqtinchalik yechim: dasturda yangi IP ni kiriting
3. **Doimiy yechim: `DHCP reservation` ni sozlang** (5-C bosqich) — aks holda yana takrorlanadi
4. Relelar uchun DHCP pooldan tashqarida IP oralig'i ajratib qo'ying

### 7.4 Test tugmasi ishlaydi, lekin o'yin boshlanganda chiroq yonmaydi

1. Chiroq boshqaruvi umuman **yoqilganmi**? (Stollar → Chiroq sozlamalari → yoqilgan bo'lsin)
2. Shu stolga rele **biriktirilganmi**: `driver` hali `none` emasmi, `host` bo'sh emasmi?
3. Shu stolda **qo'lda override** faol emasmi? (`lightOverrideUntil` hali tugamagan bo'lsa,
   sessiya holati e'tiborga olinmaydi) — override ni bekor qiling
4. Sessiya `paused` holatda emasmi va `lightOffOnPause` yoqiq emasmi?
5. Bridge holati "onlayn" mi? `lightSyncedAt` vaqti yangimi?
6. Bir daqiqa kuting: `forceSyncMs` bo'yicha majburiy sinxronizatsiya baribir tuzatishi kerak

### 7.5 Chiroq teskari ishlayapti (o'yin boshlansa o'chadi, tugasa yonadi)

Rele **NC** (normally closed) kontaktga ulangan.

- Yechim 1 (to'g'risi): dasturda shu stol uchun **`inverted`** ni yoqing
- Yechim 2: elektrik simni NC dan **NO** kontaktiga ko'chirsin

### 7.6 Internet uzilgan

- Chiroqlar **oxirgi holatida qoladi** — bu ataylab shunday: kutilmaganda qorong'i bo'lib qolmaydi
- Kassir devordagi **qo'l vyklyuchateli** bilan boshqaradi (shuning uchun uni saqlaganmiz)
- Internet qaytishi bilan agent 1–2 soniya ichida ulanadi va hamma stolni to'g'ri holatga keltiradi
- Sessiyalar, pul hisobi — hammasi bulutda, ular umuman ta'sirlanmaydi

### 7.7 Rele qizib ketmoqda

**Bu jiddiy — darhol tekshiring.**

1. Chiroq quvvatini o'lchang. Rele nominalidan oshgan bo'lsa → kuchliroq rele yoki **kontaktor** qo'ying
2. Rele germetik/tor qutida emasmi? Ventilyatsiya bo'lsin, boshqa issiq jihoz yonida turmasin
3. Bir kanalga bir nechta LED drayver ulanganmi? Inrush current kontaktni kuydiradi —
   yukni bo'ling yoki kontaktor qo'shing
4. Simlar klemmada **bo'sh** turmaganmi? Yomon kontakt eng ko'p qiziydigan joy —
   elektrik barcha vintlarni qayta tortsin
5. Qizigan rele **almashtiriladi** — bir marta kuygan kontakt keyin baribir yopishib qoladi

### 7.8 Wi-Fi signali zaif (relelar goh yo'qoladi, goh paydo bo'ladi)

1. Signal darajasini rele veb-interfeysidan ko'ring (RSSI). **-70 dBm dan yomon** bo'lsa — muammo bor
2. Rele metall shchit/armatura ichida bo'lsa — Wi-Fi o'tmaydi, tashqariga chiqaring
3. Router zal markaziga ko'chirilsin; 2.4 GHz kanalni qo'lda tanlang (1, 6 yoki 11)
4. Wi-Fi repeater / mesh nuqtasi qo'shing
5. Relelar faqat **2.4 GHz** ni tushunadi — router 5 GHz bilan bitta nomda (band steering)
   bo'lsa, 2.4 GHz uchun alohida SSID yarating
6. **Eng yaxshi yechim:** B variantiga o'tish (Shelly Pro 4PM, **LAN kabeli** bilan)

### 7.9 Token yo'qolgan / kim biladi degan shubha bor

1. Dasturda **Stollar → Chiroq sozlamalari → "Token yaratish"** ni qayta bosing
2. Yangi token chiqadi, **eski token o'sha zahoti ishlamay qoladi**
3. Yangi tokenni agent sozlamasiga (`bridge/.env`) qo'ying va agentni qayta ishga tushiring
4. Tokenni Telegram/WhatsApp orqali yubormang; qog'ozga yozib seyfda saqlang

### 7.10 Bitta stolning chirog'i o'rniga boshqasi yonyapti

1. `host` (IP) larni chalkashtirib yuborilgan — 5-C bosqichdagi jadvalni tekshiring
2. `channel` noto'g'ri: kanal **0 dan** boshlanadi (Shelly Pro 4PM: 1-chiqish = `0`)
3. Har relega stol raqamini yozib yopishtirish shu joyda asqotadi

### 7.11 Dasturda "chiroq holati noma'lum" (unknown) turibdi

- Agent hali birinchi hisobotni yubormagan — 1 daqiqa kuting (`forceSyncMs`)
- Yoki agent offlayn (7.1-bo'lim)
- Bu holat **hech narsani buzmaydi** — shunchaki holat hali ma'lum emas degani

---

## 8. Xarajat jadvali

> **Narxlar taxminiy, 2026 yil holatiga ko'ra, AQSh dollarida.**
> Jihoz va montaj alohida ko'rsatilgan. Yetkazib berish va bojxona kiritilmagan.

### 8.1 Umumiy (har uch variantda kerak) — bir marta

| Element | Taxminiy narx |
|---|---|
| Bridge kompyuter (Raspberry Pi / mini-PC) | 35–80 $ *(kassa PC ishlatilsa 0 $)* |
| Wi-Fi router (kerak bo'lsa) | 25–60 $ *(mavjud bo'lsa 0 $)* |
| UPS (400–650 VA) | 40–90 $ |
| **Jami "umumiy"** | **100–230 $** *(mavjud jihoz bilan 40–90 $)* |

### 8.2 4 stol

| | Variant A | Variant B | Variant C |
|---|---|---|---|
| Relelar | 4 x 15 $ = **60 $** | 1 x Shelly Pro 4PM = **140 $** | ESP32+8 kanal modul = **35 $** |
| Shchit, avtomat, shina | 15 $ | 55 $ | 55 $ |
| Kabel + gofra | 20 $ | 60 $ | 60 $ |
| Mayda materiallar | 20 $ | 25 $ | 25 $ |
| Umumiy (8.1, o'rtacha) | 150 $ | 150 $ | 150 $ |
| **JIHOZ JAMI** | **~265 $** | **~430 $** | **~325 $** |
| Elektrik/montaj ishi | 40–80 $ | 100–160 $ | 120–180 $ |
| **HAMMASI** | **~305–345 $** | **~530–590 $** | **~445–505 $** |

### 8.3 8 stol

| | Variant A | Variant B | Variant C |
|---|---|---|---|
| Relelar | 8 x 15 $ = **120 $** | 2 x Shelly Pro 4PM = **280 $** | ESP32+8 kanal modul = **35 $** |
| Shchit, avtomat, shina | 25 $ | 85 $ | 85 $ |
| Kabel + gofra | 35 $ | 110 $ | 110 $ |
| Mayda materiallar | 30 $ | 40 $ | 40 $ |
| Umumiy (8.1, o'rtacha) | 150 $ | 150 $ | 150 $ |
| **JIHOZ JAMI** | **~360 $** | **~665 $** | **~420 $** |
| Elektrik/montaj ishi | 80–160 $ | 200–320 $ | 220–330 $ |
| **HAMMASI** | **~440–520 $** | **~865–985 $** | **~640–750 $** |

> B variantida 8-kanalli arzon Ethernet rele plata tanlansa (280 $ o'rniga ~50 $),
> jihoz jami **~435 $** ga tushadi — lekin kafolat va quvvat o'lchash bo'lmaydi.

### 8.4 12 stol

| | Variant A | Variant B | Variant C |
|---|---|---|---|
| Relelar | 12 x 15 $ = **180 $** | 3 x Shelly Pro 4PM = **420 $** | 2 x (ESP32+modul) = **70 $** |
| Shchit, avtomat, shina | 35 $ | 120 $ | 120 $ |
| Kabel + gofra | 50 $ | 165 $ | 165 $ |
| Mayda materiallar | 40 $ | 55 $ | 55 $ |
| Umumiy (8.1, o'rtacha) | 150 $ | 150 $ | 150 $ |
| **JIHOZ JAMI** | **~455 $** | **~910 $** | **~560 $** |
| Elektrik/montaj ishi | 120–240 $ | 300–480 $ | 320–480 $ |
| **HAMMASI** | **~575–695 $** | **~1210–1390 $** | **~880–1040 $** |

### 8.5 Xulosa

| Klub hajmi | Tavsiya |
|---|---|
| 1–4 stol | **Variant A** — eng arzon va eng tez |
| 5–8 stol | **Variant A** (ta'mir yo'q bo'lsa) yoki **Variant B** (kapital ta'mir bo'lsa) |
| 9+ stol | **Variant B** — LAN ishonchliligi va tartibli shchit uzoq muddatda o'zini oqlaydi |
| Byudjet juda tor + mutaxassis bor | **Variant C** |

**O'zini oqlashi:** 8 stolli klubda kunlik 3–5 soat ortiqcha yonib turgan chiroq
(8 x 200 Vt) oyiga taxminan 40–80 kVt·soat isrof beradi. Bunga xodimning "chiroqni o'chirdimmi?"
degan tashvishi va stolning kimdir o'ynayotgandek ko'rinishi qo'shiladi. Odatda tizim
**8–18 oyda** o'zini oqlaydi (elektr tarifiga qarab).

---

## 9. Tez-tez so'raladigan savollar

**S: Internet uzilsa nima bo'ladi?**
J: Chiroqlar **oxirgi holatida qoladi** — yonganlari yonib turadi, o'chganlari o'chiq.
Kassir devordagi qo'l vyklyuchateli bilan boshqaradi. Internet qaytishi bilan (1–2 soniya)
agent hamma stolni to'g'ri holatga keltiradi. Dasturning o'zi (sessiya, pul) internetsiz baribir
ishlamaydi, chunki u bulutda — bu chiroqqa aloqasiz masala.

**S: Server o'chib qolsa yoki texnik ishlar bo'lsa?**
J: Xuddi shunday — chiroqlar oxirgi holatda qoladi, agent qayta ulanishga urinib turadi.
Rele o'zi mustaqil qurilma: unga hech kim buyruq bermasa, joriy holatini saqlaydi.

**S: Elektr o'chib yonsa nima bo'ladi?**
J: Relelar o'chgan holatda ishga tushadi (Shelly da buni sozlash mumkin, tavsiya —
`Power on default: OFF`). Agent 1 daqiqa ichida (`forceSyncMs`) yoki version o'zgarishi bilan
kerakli holatni qayta qo'llaydi va faol sessiyasi bor stollar chirog'ini yana yoqadi.
**Router va bridge kompyuter UPS da bo'lsa** — bu jarayon yanada tez va ishonchli kechadi.

**S: Chiroqni qo'lda yoqsa bo'ladimi?**
J: Ha, **ikki yo'l bilan**:
1. **Devordagi vyklyuchatel** (detached rejimda ulangan) — internet/server bo'lmasa ham ishlaydi.
   Keyin agent kerakli holatga qaytaradi.
2. **Dasturdan qo'lda override** — muayyan muddatga (masalan 30 daqiqa) sessiya holatidan
   qat'i nazar yoqib/o'chirib turadi, muddat tugagach avtomatik rejim qaytadi.

**S: Bir nechta klubga bittadan bridge kerakmi?**
J: **Ha.** Har klubning o'z lokal tarmog'i bor, shuning uchun har klubda **alohida bridge agent**
va **alohida token** bo'ladi. Bir agent faqat o'z klubining stollarini ko'radi va boshqaradi.
Bitta binoda ikkita klub bo'lsa ham — ikkita agent.

**S: Bir bridge nechta stolni ko'tara oladi?**
J: Amalda cheklov relening emas, tarmoqning imkoniyatida. Bitta Raspberry Pi 50+ stolni
bemalol boshqaradi — trafik juda kichik.

**S: Mavjud chiroqlarni almashtirish kerakmi?**
J: **Yo'q.** Rele oddiy vyklyuchatel o'rnida ishlaydi — chiroq qanday bo'lsa shundayligicha qoladi
(LED, lyuminessent, hatto lampochka). Faqat dimmerlangan (yorug'ligi o'zgaradigan) chiroqlar
bilan ehtiyot bo'ling — rele ularni faqat yoqadi/o'chiradi, yorug'ligini boshqarmaydi.

**S: Rele chiroqning yorug'ligini kamaytira oladimi?**
J: Bu versiyada **yo'q** — faqat yoq/o'chir. Dimmer kerak bo'lsa Shelly Dimmer 2 kabi qurilma
va alohida integratsiya kerak bo'ladi.

**S: Xodim relening IP siga kirib chiroqni o'zi boshqarib qo'ysa-chi?**
J: Relega parol qo'ying (`auth` maydonida dasturga kiritiladi) va relelar uchun alohida
Wi-Fi tarmog'i/VLAN ajrating. Baribir `forceSyncMs` bo'yicha tizim har daqiqada kerakli holatni
qayta qo'llaydi — qo'lda o'zgartirish uzoqqa bormaydi.
Rele **paroli va manzili** dastur javoblarida hech qachon ko'rinmaydi: oddiy stol/sessiya
so'rovlari (kassir, operator ham chaqiradi) ularni umuman qaytarmaydi, klub egasi paneli esa
faqat "parol o'rnatilgan" belgisini ko'rsatadi. Parol serverda saqlanadi va faqat relega
buyruq yuborishda ishlatiladi.

**S: Klub tarmog'iga tashqaridan kirish xavfi bormi?**
J: Yo'q. Agent **o'zi chiqadi** (chiquvchi HTTPS), routerda hech qanday port ochilmaydi.
Serverdan klub tarmog'iga kiruvchi ulanish umuman yo'q. `DIRECT` rejimida esa server faqat
**xususiy IP** larga (10.x, 172.16–31.x, 192.168.x, 127.x) murojaat qila oladi — bu SSRF himoyasi.

**S: Ijaradagi binodan ko'chsak, jihozni olib keta olamizmi?**
J: **Variant A** da — ha, relelar oson yechiladi. **Variant B** da shchit va kabel binoda qoladi
(relelarni DIN reykadan yechib olish mumkin).

**S: Bu funksiyani keyinroq yoqsam bo'ladimi?**
J: Ha. Chiroq boshqaruvi standart holatda **o'chiq**. Istalgan vaqtda yoqasiz, xohlasangiz
faqat 1–2 stolda sinab ko'rasiz, qolganlarini keyin qo'shasiz.

---

## Ilova: qisqacha xotira varaqasi (montajchi uchun)

```
1. Avtomat o'chirilgan -> kuchlanish yo'qligi tekshirilgan
2. Rele FAZANI uzadi (L in -> L out), NOLNI EMAS
3. Relega N (nol) shart -> yorug'lik nuqtasida bo'lsin
4. Devor vyklyuchateli -> SW kirishiga, rele sozlamasi: DETACHED
5. Har relega DOIMIY IP (router: DHCP reservation)
6. Rele korpusiga STOL RAQAMI yozib yopishtirilsin
7. Brauzerdan sinash:
      Shelly Gen2/3 : http://IP/rpc/Switch.Set?id=0&on=true
      Shelly Gen1   : http://IP/relay/0?turn=on
      Tasmota       : http://IP/cm?cmnd=Power1%20On
8. Rele veb-interfeysiga PAROL qo'yilsin
9. Dasturda: driver + host + channel (0 dan!) + Test tugmasi
10. Bitta stolda haqiqiy o'yin bilan sinab ko'rilsin
```

**Aloqa:** apparat tanlash yoki montaj bo'yicha savol bo'lsa — dastur ichidagi
"Yordam / Fikr-mulohaza" bo'limi orqali murojaat qiling.
