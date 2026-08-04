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

> ### ⚠️ `DIRECT` rejimi standart holatda YOPIQ (operator ruxsati talab qilinadi)
>
> `DIRECT` rejimda **server** lokal tarmoqqa so'rov yuboradi. Bulutda joylashgan serverda
> (AWS/GCP/Hetzner xususiy tarmog'i, Docker/Kubernetes) aynan o'sha xususiy IP oraliqlarida
> serverning **o'z PostgreSQL i, Redis i va ichki panellari** turadi. Shu sababli klub admini
> rele manzili o'rniga ichki xizmat manzilini yozib, javob matnidan qaysi port ochiqligini
> aniqlab olishi mumkin edi.
>
> Endi `DIRECT` rejim faqat **operator ochiq ruxsat bergan tarmoqlarda** ishlaydi:
>
> ```bash
> # server/.env
> LIGHTS_DIRECT_ALLOWED_CIDRS=192.168.1.0/24
> ```
>
> - **Standart qiymat — bo'sh**, ya'ni `DIRECT` hech qayerga chiqmaydi.
> - Format: vergul bilan ajratilgan IPv4 CIDR lar; yakka IP `/32` deb qabul qilinadi.
> - Ro'yxat **mavjud tekshiruvlarning ustiga** qo'shiladi — manzil baribir xususiy (RFC1918)
>   bo'lishi shart, `127.x` va domen nomlariga hech qachon ruxsat yo'q.
> - Qiymat server ishga tushganda bir marta o'qiladi — o'zgartirilsa qayta ishga tushiring.
> - `driver=http` shablon URL lari faqat **80, 443, 8080, 8081, 8123** portlariga chiqa oladi.
>
> **BRIDGE rejimi (tavsiya etilgan yo'l) bu cheklovdan mutlaqo ta'sirlanmaydi.** Bulutdagi server
> uchun to'g'ri yechim — har doim bridge agent.

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

## 2. Apparat variantlari

Quyida **oltita** variant bor:

- **A, B, C** — eng ko'p ishlatiladigan yechimlar. Rele oddiy HTTP so'rov bilan boshqariladi,
  shuning uchun ular `bridge` rejimida ham, `direct` (on-premise) rejimida ham ishlaydi.
- **D, E, F** — maxsus holatlar uchun: Wi-Fi to'lib ketgan yoki signal yetmayapti (D),
  sanoat darajasidagi ishonchlilik va 12+ stol (E), eng arzon va eng tez boshlanish (F).
  Bu uchtasi **faqat `bridge` rejimida** ishlaydi — buyruq klubdagi agent orqali yuboriladi
  (bulutdagi server MQTT brokerga, Modbus platasiga yoki USB portga to'g'ridan-to'g'ri chiqa olmaydi).

Shoshilmang: 1–6 stol uchun deyarli har doim **Variant A** to'g'ri javob bo'ladi.

> **Yana bir bor: quyidagi barcha narxlar — TAXMINIY**, 2026 yil holatiga ko'ra, faqat jihozning
> o'zi uchun. Model nomlari ham **misol** sifatida keltirilgan — mahalliy bozorda topilgan
> ekvivalent qurilma ham yaraydi. Sotib olishdan oldin joriy narxni va qurilmaning
> HTTP/MQTT/Modbus API si borligini albatta tekshiring.

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

### Variant D — MQTT / Zigbee (Zigbee2MQTT + koordinator)

**Kimga mos:** zal katta va Wi-Fi signali stollarga yetmayapti; routerga 10–15 tadan ortiq qurilma
ulanib, ular goh yo'qolib turadi; klubda allaqachon smart-home (Home Assistant, Zigbee) bor;
kelajakda chiroqdan tashqari rozetka, harorat datchigi, eshik datchigi ham qo'shmoqchisiz.

Zigbee — Wi-Fi dan alohida radio tarmoq. Har rele **qo'shni relega signal uzatadi** (mesh),
shuning uchun 30 metrlik zalda ham ohirgi stol koordinatorga bevosita "eshitilmasa" ham ishlaydi.
Zigbee qurilmalari `Zigbee2MQTT` dasturi orqali **MQTT brokerga** ulanadi, dastur esa
`mqtt` drayveri bilan brokerga bitta xabar yozadi.

**Kerakli jihozlar (8 stolli klub misolida):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | Zigbee koordinator | **SONOFF Zigbee 3.0 USB Dongle Plus** (USB, bridge PC ga) | 1 | 20–30 $ |
| | *yoki (LAN/PoE)* | **SMLIGHT SLZB-06** — koordinatorni zal markaziga osib qo'yish mumkin | 1 | 35–50 $ |
| 2 | Zigbee rele (1 kanal) | **Sonoff ZBMINI-L2** yoki Moes/Tuya ZigBee rele (10A) | 8 | 10–14 $/dona |
| | *yoki (2 kanal)* | Moes/Tuya ZigBee 2 kanalli rele | 4 | 14–20 $/dona |
| 3 | USB uzaytirgich | USB 2.0 kabel 1–2 m (koordinatorni USB 3.0 portidan uzoqlashtirish uchun) | 1 | 3–5 $ |
| 4 | Broker + Zigbee2MQTT uchun kompyuter | bridge kompyuterning **o'zi** yetadi (Raspberry Pi 4 dan yuqori) | — | 0 $ |

**8 stol uchun jihoz: taxminan 110–160 $** (bridge kompyuter allaqachon bor deb hisoblansa).

**Afzalliklari:**
- Wi-Fi ni umuman band qilmaydi — router "10 ta rele + kassa + kameralar" dan qutuladi
- **Mesh:** har rele repeater vazifasini bajaradi, zal kattalashgani sari tarmoq **kuchayadi**
- Bitta ulanish nuqtasi: agent brokerga ulanadi, har relega alohida IP kerak emas
  (ya'ni `DHCP reservation` bilan ovora bo'lish yo'q)
- `stateTopic` orqali qurilmaning **haqiqiy holati** o'qiladi → verify va drift tuzatish to'liq ishlaydi (6.8)
- Zigbee2MQTT 4000+ qurilmani qo'llab-quvvatlaydi — keyinchalik datchik/rozetka qo'shish arzon
- Batareyali qurilmalar (tugma, harakat datchigi) shu tarmoqqa qo'shiladi

**Kamchiliklari:**
- **Faqat `bridge` rejimida** ishlaydi
- Qo'shimcha ikkita dastur (Mosquitto + Zigbee2MQTT) o'rnatiladi va vaqti-vaqti bilan yangilanadi —
  bu "o'rnatib qo'ydim va unutdim" darajasida emas
- Koordinator buzilsa yoki USB dan chiqib ketsa — **butun zal** boshqarilmay qoladi (yagona nuqta)
- Zigbee ham 2.4 GHz da ishlaydi: Zigbee kanali (15/20/25) Wi-Fi kanali (1/6/11) bilan
  to'g'ri tanlanmasa, ikkalasi bir-biriga xalaqit beradi
- "Nolsiz" modellar (ZBMINI-L2 kabi) ba'zi LED chiroqlarda o'chgan holatda **miltillashi** mumkin —
  imkoni bo'lsa nol simi bor modelni oling
- Juftlash (pairing) va qurilmalarga to'g'ri nom berish — qo'shimcha 1–2 soatlik ish

---

### Variant E — Modbus TCP sanoat rele platasi

**Kimga mos:** 12 va undan ko'p stolli klub; 24/7 ishlaydigan, yiliga million marta yonib-o'chadigan
ishonchli yechim kerak; binoda allaqachon Modbus avtomatika (ventilyatsiya, kondisioner, hisoblagich) bor;
shchit yig'ish imkoni va elektrik bor.

Modbus TCP — sanoatda o'nlab yillardan beri ishlatiladigan protokol. Plata LAN (yoki PoE) bilan
ulanadi, agent unga `FC5 (write coil)` buyrug'ini yuboradi va `FC1 (read coils)` bilan
haqiqiy holatni o'qiydi.

**Kerakli jihozlar (16 kanal = 16 stol misolida):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | Modbus TCP rele moduli | **Waveshare Modbus POE ETH Relay** (8 kanal, DIN, PoE) | 2 | 45–65 $/dona |
| | *yoki* | 16-kanalli Modbus TCP rele plata (LAN) | 1 | 60–95 $ |
| | *yoki (RS-485 li)* | Modbus RTU rele (8 kanal) + RS485↔Ethernet konverter | 2 + 1 | 25 $/dona + 20 $ |
| 2 | Quvvat bloki | 24 V DC, 2 A, DIN (plata pasportiga qarab 12 V bo'lishi mumkin) | 1 | 10–15 $ |
| 3 | Oraliq kontaktor *(kuchli chiroqlarda)* | 20 A, 1NO, DIN modul | kerakligicha | 8–14 $/dona |
| 4 | Shchit, avtomatlar, kabel | B variantidagidek | — | B variantiga qarang |

**16 stol uchun rele qismi: taxminan 100–140 $** — ya'ni stol boshiga **7–9 $**, bu eng arzon
"sertifikatlangan" variant.

**Afzalliklari:**
- Sanoat qurilmasi: keng harorat oralig'i, uzoq xizmat muddati, ishonchli kontaktlar
- **LAN / PoE** — Wi-Fi bilan bog'liq muammolarning hammasi yo'qoladi
- Kanal narxi juda past; kengaytirish arzon (yana 8 kanal ~50 $)
- Holatni **o'qish** mumkin (FC1) → verify va drift tuzatish to'liq ishlaydi (6.8)
- Ko'p modellarida PoE bor — alohida quvvat bloki va rozetka kerak emas

**Kamchiliklari:**
- **Faqat `bridge` rejimida** ishlaydi
- **Autentifikatsiya YO'Q.** Modbus da parol degan tushuncha yo'q: tarmoqqa ulangan har qanday
  kompyuter releni boshqara oladi. Shuning uchun platani **alohida VLAN / alohida tarmoq segmentiga**
  qo'yish va internetga umuman chiqarmaslik shart
- Bitta plata buzilsa — birdaniga 8–16 stol ta'sirlanadi
- Koil (coil) raqamlash ishlab chiqaruvchiga bog'liq: ba'zi platada 1-rele = `0`, ba'zilarida = `1` —
  pasportdan tekshirish kerak (eng ko'p uchraydigan sozlash xatosi)
- Arzon platalarning hujjatlari ko'pincha yomon tarjima qilingan, texnik yordam yo'q
- Ko'p arzon plata bir vaqtning o'zida **bitta** TCP ulanishni qabul qiladi

---

### Variant F — USB rele (**eng arzon**, kassa PC ga ulanadi)

**Kimga mos:** 1–4 stolli kichik klub; kassa kompyuteri stollarga yaqin (bir zalda) va doim yoqiq;
tarmoq umuman yo'q yoki ishonchsiz; "avval arzonga sinab ko'ray, yoqsa kengaytiraman" degan holat.

Bu yerda hech qanday tarmoq yo'q: rele platasi bridge agenti ishlayotgan kompyuterga
**USB kabel** bilan ulanadi va oddiy COM port sifatida ko'rinadi. Agent unga 4 baytlik
buyruq yuboradi.

**Kerakli jihozlar (4 stolli klub misolida):**

| # | Jihoz | Model | Soni | Taxminiy narx (2026) |
|---|---|---|---|---|
| 1 | USB rele moduli | **LCUS-4** (CH340, 4 kanal, 10A) | 1 | 7–12 $ |
| | *yoki (1 kanal)* | **LCUS-1** — har stolga bittadan | 4 | 3–5 $/dona |
| | *yoki (8 kanal)* | LCUS-8 / CH340 asosidagi 8 kanalli plata | 1 | 12–20 $ |
| 2 | Aktiv USB uzaytirgich | 5 m (kassa → shchit oralig'i uzoq bo'lsa) | 1 | 6–10 $ |
| 3 | Korpus + klemma | DIN yoki devor korpusi, vintli klemmalar | 1 | 6–12 $ |
| 4 | CH340 drayveri (Windows) | bepul (`CH341SER.EXE`) | — | 0 $ |

**4 stol uchun jihoz: taxminan 20–35 $** — ya'ni stol boshiga **5–9 $**.

**Afzalliklari:**
- Narxi bo'yicha tengi yo'q; zaxira plata olib qo'yish ham 10 $
- **Tarmoq umuman kerak emas** — Wi-Fi, IP, DHCP, router muammolari yo'q
- Kechikish ~10 ms (kabel orqali) — chiroq tugma bosilishi bilan yonadi
- Sozlash 10 daqiqa: drayver + COM port + hex buyruqlar

**Kamchiliklari:**
- **Faqat `bridge` rejimida** va **faqat agent ishlayotgan kompyuterda** ishlaydi
- USB kabel uzunligi bilan cheklangan (odatda 5 m, aktiv kabel bilan 10–15 m) — stollar
  uzoq bo'lsa yaramaydi
- Kompyuter o'chsa yoki uyquga ketsa — boshqaruv butunlay yo'qoladi (tarmoqdagi relelar esa
  hech bo'lmaganda oxirgi holatida qoladi)
- **Holatni o'qib bo'lmaydi:** LCUS platalarining ko'pchiligi javob qaytarmaydi →
  verify ishlamaydi, dastur faqat "buyruq yuborildi" deb biladi (6.8)
- COM port raqami USB uyasi almashtirilsa o'zgaradi (doimiy raqam berish kerak — 5-K bosqich)
- Sertifikat va kafolat yo'q, kontaktlar arzon (C variantidagi kamchiliklar bu yerda ham bor)
- Agentga bitta npm paketi kerak bo'ladi: `npm i serialport` (5-K bosqich)

---

### Variantlarni solishtirish (A, B, C)

| Mezon | A (har stolga rele) | B (markaziy DIN) | C (o'zi yig'ish) |
|---|---|---|---|
| 8 stol uchun jihoz narxi | 120–150 $ | 230–520 $ | 30–50 $ |
| Montaj murakkabligi | Past | Yuqori | O'rta |
| Ishonchlilik | Yaxshi | **Eng yaxshi** | O'rta |
| Ulanish | Wi-Fi | **LAN** (kabel) | Wi-Fi |
| Sertifikat/kafolat | Bor | Bor | **Yo'q** |
| Kengaytirish | Har stol +15 $ | Kanal tugasa +140 $ | Juda arzon |
| Tavsiya | 1–6 stol | **6+ stol** | Faqat mutaxassis bilan |

### Variantlarni solishtirish (D, E, F)

| Mezon | D (Zigbee/MQTT) | E (Modbus TCP) | F (USB rele) |
|---|---|---|---|
| 8 stol uchun jihoz narxi | 110–160 $ | 100–140 $ *(16 kanalga)* | 15–30 $ |
| Montaj murakkabligi | O'rta (+ dasturiy sozlash) | Yuqori | **Eng past** |
| Ishonchlilik | Yaxshi (mesh) | **Eng yaxshi** | O'rta |
| Ulanish | Zigbee mesh → broker | **LAN / PoE** | USB kabel |
| Dastur rejimi | faqat **bridge** | faqat **bridge** | faqat **bridge** |
| Holat o'qish (verify) | Bor (`stateTopic`) | Bor (FC1) | **Yo'q** |
| Parol / himoya | broker login+parol | **yo'q** — VLAN shart | fizik kabel |
| Sertifikat/kafolat | Bor | Bor | Yo'q |
| Kengaytirish | Har stol +12 $ | Kanal tugasa +50 $ | Kanal tugasa +10 $ |
| Tavsiya | Wi-Fi tor bo'lsa, 6–20 stol | 12+ stol, sanoat darajasi | 1–4 stol yoki sinov |

### Drayverlar solishtiruvi (dasturdagi `driver` maydoni)

Har stolga qaysi drayver tanlanishi shu jadval bilan aniqlanadi. **Direct** — bulutdagi (yoki
lokal) serverning o'zi buyruq yuboradi; **Bridge** — buyruqni klubdagi agent yuboradi.

| Drayver | Direct | Bridge | Holat o'qish (verify) | Parol turi | Tipik qurilmalar | Ulanish |
|---|---|---|---|---|---|---|
| `shelly_gen1` | Ha | Ha | **Bor** (`/relay/0`) | Basic (`user:parol`) | Shelly 1 / 1PM (eski avlod) | Wi-Fi |
| `shelly_gen2` | Ha | Ha | **Bor** (`Switch.GetStatus`) | **Digest** (`admin:parol`) | Shelly Plus / Pro / Gen3, Pro 4PM | Wi-Fi / LAN |
| `tasmota` | Ha | Ha | **Bor** (`/cm?cmnd=Power1`) | Basic (`user:parol`) | Sonoff MINI R4, ESP32/ESP8266 | Wi-Fi |
| `esphome` | Ha | Ha | **Bor** (`/switch/<entity>`) | Basic (`user:parol`) | ESPHome proshivkali ESP32/ESP8266 | Wi-Fi |
| `home_assistant` | Ha | Ha | **Bor** (`/api/states/...`) | **Bearer token** (long-lived) | HA ko'radigan har qanday qurilma (Zigbee, Z-Wave, Tuya) | LAN |
| `http` | Ha | Ha | Yo'q | o'zingiz kiritgan URL / Basic | boshqa har qanday qurilma | LAN |
| `mqtt` | **Yo'q** | Ha | **Bor** (`stateTopic` bo'lsa) | broker login+parol (agent `.env` da) | Zigbee2MQTT, Tasmota-MQTT, ESPHome-MQTT | LAN (broker) |
| `modbus_tcp` | **Yo'q** | Ha | **Bor** (FC1 read coils) | **yo'q** — tarmoq bilan himoyalanadi | Waveshare va sanoat rele platalari | LAN / PoE |
| `tcp` | **Yo'q** | Ha | Qisman (javob bayti tekshiriladi) | odatda yo'q | xom TCP protokolli relelar | LAN |
| `serial` | **Yo'q** | Ha | Yo'q | yo'q (fizik ulanish) | LCUS-1/2/4/8 (CH340) USB rele | USB (COM port) |
| `none` | — | — | — | — | *chiroq boshqarilmaydi* (standart qiymat) | — |

> **`mqtt`, `modbus_tcp`, `tcp`, `serial`** — klub rejimi `direct` bo'lsa dastur bu drayverlarni
> saqlashga ruxsat bermaydi ("bu drayver faqat lokal agent rejimida ishlaydi" degan xato chiqadi).
> Rejimni `bridge` ga o'tkazing.
>
> **Parol turi** — dasturdagi `auth` maydoniga nima yozilishini bildiradi:
> `shelly_*`, `tasmota`, `esphome` uchun `foydalanuvchi:parol`; `home_assistant` uchun esa
> **faqat token** (Home Assistant → Profil → Long-lived access tokens). `mqtt` brokerining
> paroli dasturga umuman kiritilmaydi — u faqat klubdagi agentning `.env` faylida turadi.
>
> **Holat o'qish (verify)** nima qilishi 6.8-bo'limda tushuntirilgan.

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
| `esphome` | `POST http://192.168.1.51/switch/relay_1/turn_on` | `.../turn_off` — quyidagi misolga qarang |
| `home_assistant` | `POST http://192.168.1.10:8123/api/services/switch/turn_on` | `.../switch/turn_off` — quyidagi misolga qarang |
| `mqtt` / `modbus_tcp` / `serial` | brauzerdan sinab bo'lmaydi — 5-I, 5-K, 5-L bosqichlariga qarang | — |

`esphome` va `home_assistant` da so'rov **POST** bo'lgani uchun brauzer manzil qatori yaramaydi —
`curl` yoki Postman ishlating:

```bash
# ESPHome
curl -X POST http://192.168.1.51/switch/relay_1/turn_on

# Home Assistant (token — Profil -> Long-lived access tokens)
curl -X POST http://192.168.1.10:8123/api/services/switch/turn_on \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"entity_id":"switch.stol_3"}'
```

- [ ] Har stol uchun ON va OFF ni sinab ko'ring
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

- [ ] `driver` — ro'yxatdan birini tanlang: `shelly_gen2` / `shelly_gen1` / `tasmota` /
      `esphome` / `home_assistant` / `http` / `mqtt` / `modbus_tcp` / `tcp` / `serial`
      (`none` = bu stolda chiroq boshqarilmaydi — standart qiymat).
      Qaysi biri nima ekanini 2-bo'limdagi **"Drayverlar solishtiruvi"** jadvalidan qarang
- [ ] `host` — IP (`192.168.1.51`) yoki port bilan (`192.168.1.51:8080`)
- [ ] `channel` — relay kanali, **0 dan boshlanadi** (bir kanalli relelarda `0`;
      Shelly Pro 4PM da `0,1,2,3`; Tasmota da `Power1`=`0`, `Power2`=`1`)
- [ ] `inverted` — rele **NC** (normally closed) ulangan bo'lsa yoqing
- [ ] `auth` — rele veb-interfeysiga parol qo'ygan bo'lsangiz: `foydalanuvchi:parol`
      (`home_assistant` uchun bu maydonga **faqat token** yoziladi)
- [ ] `onUrl` / `offUrl` — faqat `driver = http` uchun
- [ ] Drayverga bog'liq qo'shimcha maydonlar (faqat kerakli drayver tanlanganda ko'rinadi):

  | Drayver | To'ldiriladigan maydonlar |
  |---|---|
  | `home_assistant` | `entityId` (`switch.stol_3`), `host` = `192.168.1.10:8123`, `auth` = token |
  | `esphome` | `entity` (`relay_1`), `host` |
  | `mqtt` | `topic`, `onPayload`, `offPayload`, ixtiyoriy `stateTopic` (5-J bosqich) |
  | `modbus_tcp` | `host` (`192.168.1.80:502`), `unitId`, `coil` (5-L bosqich) |
  | `tcp` / `serial` | `onHex` / `offHex` (yoki `onAscii` / `offAscii`), `serial` uchun `serialPort` va `baudRate` (5-K bosqich) |

- [ ] **"Qo'shimcha"** bo'limida (kerak bo'lsa): `channels` — bitta stolda 2–3 lampa bo'lsa
      qo'shimcha kanal raqamlari; `verify` — shu stol uchun holatni tekshirishni alohida
      yoqish/o'chirish (6.8-bo'lim)
- [ ] **"Yoqib ko'rish" / "O'chirib ko'rish"** tugmalarini bosing → chiroq yonib-o'chishi kerak
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

> **Quyidagi 5-I … 5-L bosqichlari — IXTIYORIY.** Ular faqat **D (Zigbee/MQTT)**,
> **E (Modbus TCP)** va **F (USB rele)** variantlarini tanlaganlar uchun.
> A, B, C variantlarida ular **umuman kerak emas** — 5-H bosqichda ish tugadi.
> Bu bosqichlar 5-G dan **oldin** bajariladi (avval qurilma ishlasin, keyin dasturda sozlanadi).

### 5-I bosqich (ixtiyoriy). MQTT broker — Mosquitto o'rnatish

Faqat `mqtt` drayveri uchun (Variant D, yoki Tasmota ni MQTT orqali boshqarmoqchi bo'lsangiz).
Broker odatda **bridge kompyuterning o'ziga** o'rnatiladi — u holda agent bilan broker orasida
tarmoq umuman ishtirok etmaydi.

**Windows da:**

- [ ] https://mosquitto.org/download dan `mosquitto-2.x-install-windows-x64.exe` ni yuklab o'rnating
      (o'rnatishda **Service** komponenti belgilangan bo'lsin)
- [ ] `C:\Program Files\mosquitto\mosquitto.conf` faylini **administrator** huquqi bilan
      Notepad da oching va oxiriga qo'shing:

  ```
  listener 1883 0.0.0.0
  allow_anonymous false
  password_file C:\Program Files\mosquitto\passwd
  ```

- [ ] Foydalanuvchi yarating (administrator `cmd`):

  ```
  cd "C:\Program Files\mosquitto"
  mosquitto_passwd -c passwd billiard
  ```

- [ ] Xizmatni qayta ishga tushiring: `net stop mosquitto` so'ng `net start mosquitto`
- [ ] Windows Defender Firewall da 1883-portga **faqat Private (lokal) tarmoq** uchun ruxsat bering

**Raspberry Pi / Linux da:**

```bash
sudo apt-get update
sudo apt-get install -y mosquitto mosquitto-clients
sudo mosquitto_passwd -c /etc/mosquitto/passwd billiard
echo 'listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd' | sudo tee /etc/mosquitto/conf.d/billiard.conf
sudo systemctl enable --now mosquitto
sudo systemctl restart mosquitto
```

**Tekshirish** (ikkita terminal oching):

```bash
# 1-terminal — tinglaymiz
mosquitto_sub -h 127.0.0.1 -u billiard -P <parol> -t 'test/#' -v
# 2-terminal — yuboramiz
mosquitto_pub -h 127.0.0.1 -u billiard -P <parol> -t 'test/x' -m 'salom'
```

Birinchi terminalda `test/x salom` chiqsa — broker ishlayapti.

- [ ] Broker ma'lumotlarini agentning `bridge/.env` fayliga qo'shing:

  ```
  MQTT_URL=mqtt://127.0.0.1:1883
  MQTT_USER=billiard
  MQTT_PASS=<broker paroli>
  ```

- [ ] Agentni qayta ishga tushiring

> **Xavfsizlik:** broker paroli **faqat klubdagi `.env` faylida** qoladi, bulutdagi serverga
> hech qachon yuborilmaydi va dasturdagi hech bir maydonga kiritilmaydi.
> 1883-portni internetdan (routerdan) **ochmang** — u faqat lokal tarmoq uchun.

### 5-J bosqich (ixtiyoriy). Zigbee2MQTT bilan ulash

- [ ] Zigbee koordinatorni (USB stick) **USB 2.0 uzaytirgich** orqali ulang.
      To'g'ridan-to'g'ri USB 3.0 portiga tiqilsa — USB 3.0 2.4 GHz da shovqin beradi va
      Zigbee radiusi keskin kamayadi
- [ ] Portni aniqlang:
  - Linux: `ls -l /dev/serial/by-id/`
  - Windows: `Device Manager → Ports (COM & LPT)`
- [ ] Zigbee2MQTT ni o'rnating (eng qulay yo'l — Docker):

  ```bash
  sudo apt-get install -y docker.io
  sudo mkdir -p /opt/zigbee2mqtt/data
  sudo nano /opt/zigbee2mqtt/data/configuration.yaml
  ```

  ```yaml
  mqtt:
    server: mqtt://127.0.0.1:1883
    user: billiard
    password: <broker paroli>
  serial:
    port: /dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_xxxx-if00-port0
    adapter: ezsp        # dongle turiga qarab: zstack | ezsp | deconz
  advanced:
    channel: 25          # Wi-Fi bilan to'qnashmasligi uchun 15, 20 yoki 25
    network_key: GENERATE
  frontend:
    port: 8080
  ```

  ```bash
  sudo docker run -d --name zigbee2mqtt --restart=always \
    -v /opt/zigbee2mqtt/data:/app/data \
    --device=/dev/ttyUSB0 \
    -p 8080:8080 \
    koenkk/zigbee2mqtt
  ```

- [ ] Brauzerda `http://<bridge-IP>:8080` ni oching → **Permit join** ni yoqing
- [ ] Har releni juftlang (odatda tugmasini 5 soniya bosib turish) va **darhol nomini o'zgartiring**:
      `stol3` (lotin harflari, probelsiz — bu nom topic ga kiradi)
- [ ] Barcha relelar juftlangach **Permit join** ni o'chiring (begona qurilma qo'shilmasin)
- [ ] Z2M frontend dan sinab ko'ring: `stol3` → ON / OFF (chiroq yonishi kerak)
- [ ] Dasturda shu stol uchun:

  | Maydon | Qiymat |
  |---|---|
  | `driver` | `mqtt` |
  | `topic` | `zigbee2mqtt/stol3/set` |
  | `onPayload` | `{"state":"ON"}` |
  | `offPayload` | `{"state":"OFF"}` |
  | `stateTopic` | `zigbee2mqtt/stol3` *(ixtiyoriy — holatni tekshirish uchun)* |

- [ ] **"Yoqib ko'rish"** tugmasi bilan dasturdan tekshiring

> **Tasmota ni MQTT orqali boshqarish** (Zigbee siz): Tasmota sozlamalarida MQTT yoqiladi, so'ng
> `topic` = `cmnd/tasmota_1/POWER`, `onPayload` = `ON`, `offPayload` = `OFF`,
> `stateTopic` = `stat/tasmota_1/POWER`.

### 5-K bosqich (ixtiyoriy). USB rele (LCUS / CH340) ni sozlash

- [ ] **Windows:** CH340 drayverini o'rnating (`CH341SER.EXE`) → `Device Manager → Ports (COM & LPT)`
      da `USB-SERIAL CH340 (COM3)` paydo bo'lsin
- [ ] **Linux:** drayver yadroda bor, faqat huquq kerak:

  ```bash
  sudo usermod -aG dialout $USER    # keyin tizimdan chiqib qayta kiring
  ls -l /dev/ttyUSB*
  ```

- [ ] **COM port raqamini doimiy qiling** — aks holda USB uyasi almashsa port o'zgaradi:
  - Windows: `Device Manager → COM3 → Properties → Port Settings → Advanced → COM Port Number`
  - Linux: barqaror yo'lni ishlating — `/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0`
- [ ] Agentga `serialport` paketini o'rnating (bu — agentning **yagona** ixtiyoriy npm bog'liqligi):

  ```
  cd C:\billiardclub-bridge          (Linux: cd /opt/billiardclub-bridge)
  npm i serialport
  ```

  > Paket o'rnatilmasa agent boshqa hamma drayver bilan normal ishlayveradi —
  > faqat `serial` drayverli stollarda "serialport paketi o'rnatilmagan" xatosi chiqadi.

- [ ] LCUS platalarining standart buyruqlari (9600 baud, 4 bayt):

  | Kanal | Yoqish (`onHex`) | O'chirish (`offHex`) |
  |---|---|---|
  | 1 | `A0 01 01 A2` | `A0 01 00 A1` |
  | 2 | `A0 02 01 A3` | `A0 02 00 A2` |
  | 3 | `A0 03 01 A4` | `A0 03 00 A3` |
  | 4 | `A0 04 01 A5` | `A0 04 00 A4` |

  (oxirgi bayt — nazorat yig'indisi: oldingi uch baytning yig'indisi. Boshqa modelda buyruqlar
  boshqacha bo'lishi mumkin — plata pasportiga qarang.)

- [ ] Dasturda shu stol uchun: `driver` = `serial`, `serialPort` = `COM3` (yoki `/dev/ttyUSB0`),
      `baudRate` = `9600`, `onHex` / `offHex` — yuqoridagi jadvaldan
- [ ] Agentni qayta ishga tushiring va **"Yoqib ko'rish"** tugmasini bosing — plata "chirt" etib
      bosilishi va indikatori yonishi kerak

> USB rele **holatini qaytarmaydi**: dastur faqat "buyruq yuborildi" deb biladi.
> Shuning uchun bu stolda "Holatni tekshirish" (verify) ishlamaydi (6.8).

### 5-L bosqich (ixtiyoriy). Modbus TCP rele platasini sozlash

- [ ] Plataga pasportda ko'rsatilgan quvvatni (odatda 24 V DC) bering, LAN kabelini routerga ulang,
      `LINK` indikatori yonganini tekshiring
- [ ] Ishlab chiqaruvchining konfigurator dasturi (yoki plataning veb-interfeysi) orqali:
  - IP ni **statik** qiling (masalan `192.168.1.80`), port — `502`
  - `Unit ID` (slave address) ni yozib oling — odatda `1`
- [ ] **Koil raqamlanishini pasportdan tekshiring:** ko'p platada 1-rele = `0`, ba'zilarida = `1`
- [ ] Ulanishni tekshiring (bridge kompyuterdan):

  ```bash
  # Linux
  nc -vz 192.168.1.80 502
  ```
  ```powershell
  # Windows PowerShell
  Test-NetConnection 192.168.1.80 -Port 502
  ```

- [ ] Dasturda: `driver` = `modbus_tcp`, `host` = `192.168.1.80:502`, `unitId` = `1`,
      `coil` = kanal raqami (bo'sh qoldirilsa `channel` qiymati ishlatiladi)
- [ ] Konfigurator dasturini **yoping** — ko'p arzon plata bir vaqtda faqat bitta TCP ulanishni
      qabul qiladi
- [ ] **"Yoqib ko'rish"** tugmasi bilan tekshiring

> Modbus da **parol yo'q**. Platani alohida VLAN yoki kamida alohida tarmoq segmentiga qo'ying,
> internetdan (routerdan) 502-portni **hech qachon ochmang**.

---

## 6. Ishlash rejimlari va qoidalar

### 6.1 Sessiya holati → chiroq holati

Jadval **ustuvorlik tartibida** o'qiladi: yuqoridan pastga qarab **birinchi mos kelgan** qator
g'olib chiqadi.

| # | Vaziyat | Sozlama | Chiroqning kerakli holati |
|---|---|---|---|
| 1 | **Qo'lda override faol** (`lightOverrideUntil > hozir`) | — | `lightOverrideOn` **qiymati ustun turadi** |
| 2 | Stolda **faol** (`active`) sessiya bor | — | **YONIQ** |
| 3 | Sessiya **pauzada** (`paused`) | "Pauzada o'chsin" = **o'chiq** *(standart)* | **YONIQ** |
| 4 | Sessiya **pauzada** (`paused`) | "Pauzada o'chsin" = **yoqiq** | **O'CHIQ** |
| 5 | Sessiya endigina **yakunlandi / bekor qilindi** | "Sessiya tugagach yoniq qolsin" = `N` soniya va `N` hali o'tmagan | **YONIQ** (6.5) |
| 6 | Yaqin orada shu stolga **bron** bor | "Bron oldidan yoqilsin" = `M` daqiqa va bron `M` daqiqadan yaqin | **YONIQ** (6.6) |
| 7 | Sessiya **yakunlangan** (`completed`) / **bekor qilingan** (`cancelled`) | kechikish tugagan yoki `0` *(standart)* | **O'CHIQ** |
| 8 | Stolda umuman sessiya yo'q | — | **O'CHIQ** |

Qisqacha: **override → faol sessiya → pauza → kechikish (grace) → bron oldidan → o'chiq.**

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
- **`forceSyncMs`** (standart **60 000 ms = 1 daqiqa**, panelda **10–3600 soniya** oralig'ida
  sozlanadi): version o'zgarmagan bo'lsa ham agent har shu oraliqda holatni relelarga
  **majburan qayta qo'llaydi**. Bu — rele qayta yuklangan yoki kimdir qo'lda o'zgartirib qo'ygan
  holatlarni o'z-o'zidan to'g'rilaydi. "Holatni tekshirish" (verify) yoqiq bo'lsa, aynan shu
  paytda qurilmadan **haqiqiy holat o'qiladi** (6.8).
  > Juda kichik qiymat (10–15 s) tarmoqni va relelarni bekorga band qiladi; 60 s — oltin o'rtalik.
  > Wi-Fi zaif bo'lsa 120–300 s qo'yish ham mumkin.
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

### 6.5 Sessiya tugagach kechikish (grace)

**Panelda:** Stollar → Chiroq sozlamalari → **"Sessiya tugagach yoniq qolsin"** (0–3600 soniya).
**Standart qiymat — `0`**, ya'ni bu funksiya o'chiq va chiroq sessiya yakunlanishi bilan darhol o'chadi.

**Nima uchun kerak:** o'yin tugagandan keyin ish tugamaydi — mijoz stol yonida hisob-kitob qiladi,
xodim sharlarni yig'adi, movutni tozalaydi, kiy va uchburchakni joyiga qo'yadi. Qorong'ida buni
qilib bo'lmaydi va kassir har safar qo'lda yoqishga majbur bo'ladi.

- Tavsiya etiladigan qiymat: **60–180 soniya**.
- Kechikish taymer bilan emas, **oxirgi yakunlangan sessiyaning tugash vaqti** bilan hisoblanadi:
  server har safar "shu stolda oxirgi sessiya `N` soniyadan yaqinroq oldin tugaganmi?" deb qaraydi.
  Shuning uchun server yoki agent qayta ishga tushsa ham kechikish **yo'qolmaydi**.
- Vaqt tugashi bilan chiroq **bir-ikki soniya ichida** o'chadi (uzun-polling har soniyada qayta hisoblaydi).
- Grace davomida shu stolda **yangi sessiya** boshlansa — chiroq umuman o'chmaydi (o'chib-yonish bo'lmaydi).
- Kassir kutmasdan o'chirmoqchi bo'lsa — qo'lda override bilan darhol o'chiradi (6.2), override ustun turadi.

### 6.6 Bron oldidan yoqish

**Panelda:** Stollar → Chiroq sozlamalari → **"Bron oldidan yoqilsin"** (0–120 daqiqa).
**Standart qiymat — `0`** (o'chiq).

Mijoz kelganda stol allaqachon yoritilgan va tayyor bo'lishi uchun chiroq bron boshlanishidan
belgilangan daqiqa oldin yonadi.

- Faqat **`pending`** va **`confirmed`** holatidagi bronlar hisobga olinadi
  (bekor qilingan yoki tugagan bron chiroqni yoqmaydi).
- Bron vaqti kelib sessiya boshlansa — chiroq yonib turaveradi (qayta yoqilmaydi).
- **Mijoz kelmasa:** bron boshlanish vaqti o'tib ketgach shart bajarilmay qoladi va chiroq
  avtomatik o'chadi — ya'ni "yonib qolish" xavfi yo'q.
- Tavsiya: **5–15 daqiqa**. 60 daqiqa qo'yilsa va kunda 10 ta bron bo'lsa, tejash effekti sezilarli kamayadi.
- Bu qoida grace dan **keyin** turadi: agar stolda hozir grace ham, bron ham bo'lsa — baribir yonadi.

### 6.7 Master tugmalar — hammasini bir vaqtda boshqarish

**Panelda:** Stollar → Chiroq sozlamalari → **Master boshqaruv**. Uchta tugma bor:

| Tugma | Nima qiladi |
|---|---|
| **Hammasini yoqish** | Barcha stollarga tanlangan muddatga "yoq" degan qo'lda override qo'yadi |
| **Hammasini o'chirish** | Barcha stollarga tanlangan muddatga "o'chir" degan override qo'yadi |
| **Avtomatikaga qaytarish** | Barcha override larni bekor qiladi — tizim 6.1-jadvalga qaytadi |

- Muddat tanlanadi (**30 / 60 / 120 daqiqa**) va tugma **tasdiq oynasi** bilan bosiladi
  (tasodifan bosib yuborilmasligi uchun).
- Qachon kerak bo'ladi: zal yopilayotganda hammasini bir bosishda o'chirish; ertalab
  tozalash/generalka uchun hammasini yoqish; tadbir yoki fotosuratga tayyorlash; texnik
  ishlar vaqtida zalni yoritish.
- **Muhim:** master tugmalar **faqat chiroqqa** ta'sir qiladi — faol sessiyalarni to'xtatmaydi,
  pulga aloqasi yo'q.
- Muddat tugashi bilan hamma stol avtomatik rejimga qaytadi. Ya'ni "o'chirib qo'yib unutdim,
  ertaga chiroq umuman yonmay qoladi" degan holat bo'lmaydi — lekin aksincha, kechqurun
  "hammasini o'chirish" bosilsa ham, muddat tugagach **faol sessiyali** stollar qaytadan yonadi.
- Har bir master amal diagnostika jurnaliga `master` manbai bilan tushadi (6.9).

### 6.8 Holatni tekshirish (verify) va drift ni avtomatik tuzatish

**Panelda:** Stollar → Chiroq sozlamalari → **"Holatni tekshirish"** (standart holatda **yoqiq**).
Bitta stol uchun uni "Qo'shimcha" bo'limidagi `verify` bilan alohida yoqish/o'chirish mumkin —
stol sozlamasi klub sozlamasidan **ustun** turadi.

**Nima qiladi:** majburiy sinxronizatsiya paytida (har `forceSyncMs`) agent qurilmaga buyruq
yuborish bilan cheklanmaydi — undan **haqiqiy holatni o'qiydi**:

| Drayver | Holat qanday o'qiladi |
|---|---|
| `shelly_gen2` | `Switch.GetStatus` |
| `shelly_gen1` | `/relay/{kanal}` |
| `tasmota` | `/cm?cmnd=Power{N}` |
| `esphome` | `/switch/{entity}` |
| `home_assistant` | `/api/states/{entityId}` |
| `mqtt` | `stateTopic` ga obuna (kelgan qiymat ishlatiladi) |
| `modbus_tcp` | FC1 — read coils |
| `http`, `tcp`, `serial` | **o'qib bo'lmaydi** — verify ishlamaydi |

O'qilgan holat kerakli holatdan farq qilsa — bu **drift** deyiladi. Agent uni darhol tuzatadi
(buyruqni qayta yuboradi) va serverga qurilmaning haqiqiy holatini yuboradi; hodisa jurnalga
`drift` manbai bilan yoziladi (6.9).

**Drift qayerdan chiqadi:**
- kimdir relening veb-interfeysiga kirib qo'lda o'zgartirgan
- devor vyklyuchateli `detached` rejimiga o'tkazilmagan (4.1, 4-qoida)
- rele qayta yuklangan va "power on default" `ON` bo'lgan
- Zigbee/Wi-Fi da buyruq yo'lda yo'qolgan (paket yetib bormagan)

**Qachon o'chirish mumkin:** tarmoq juda sekin bo'lsa yoki eski qurilmalar qo'shimcha so'rovga
yomon javob bersa. O'chirilganda dastur faqat "buyruq yuborildi" degan ma'lumotga tayanadi —
chiroq holati ko'rsatiladi, lekin u **tasdiqlanmagan** bo'ladi.

### 6.9 Diagnostika jurnali

**Panelda:** Stollar → Chiroq sozlamalari → **Diagnostika** (bo'lim ochilganda yuklanadi).
Oxirgi hodisalar ro'yxati: vaqt, stol, yoqildi/o'chirildi, **manba**, natija (muvaffaqiyatli/xato),
xato matni va — qo'lda bajarilgan bo'lsa — xodimning ismi.

| Manba | Ma'nosi |
|---|---|
| `session` | sessiya holati o'zgardi (boshlandi / pauza / yakunlandi / transfer) |
| `override` | kassir yoki admin qo'lda yoqdi-o'chirdi |
| `master` | master tugma bosildi (6.7) |
| `test` | "Yoqib ko'rish" / "O'chirib ko'rish" tugmasi |
| `sync` | agent holatni qo'lladi va hisobot yubordi |
| `drift` | qurilmadagi holat kerakli holatdan farq qilib, avtomatik tuzatildi (6.8) |
| `settings` | chiroq sozlamalari o'zgartirildi (rejim, kechikish, tekshirish va h.k.) |

- Yozuvlar **30 kun** saqlanadi, keyin avtomatik tozalanadi.
- Nimaga asqotadi: "kecha kechqurun 5-stol chirog'i nega yonib qolgan?" degan savolga aniq javob;
  qaysi rele qaysi soatlarda xato berayotganini ko'rish (Wi-Fi zaif bo'lsa naqsh darhol ko'rinadi);
  xodim override ni suiiste'mol qilayotganini aniqlash.
- Jurnal **faqat chiroq** hodisalarini yozadi — sessiya, kassa va pul jurnallariga aloqasi yo'q.

### 6.10 Qurilmalarni qidirish (discover)

**Panelda:** Stollar → Chiroq sozlamalari → Lokal agent → **"Qurilmalarni qidirish"**.

Server agentga vazifa beradi, agent klub tarmog'ini (o'z `/24` tarmog'i: `192.168.1.1–254`)
skanerlaydi va topilgan qurilmalarni qaytaradi: **IP, MAC, model, nom, taxminiy drayver,
kanallar soni**. Har bir qator yonida **"Stolga biriktirish"** tugmasi bor — stolni tanlaysiz,
`host` va `driver` avtomatik to'ldiriladi, keyin faqat test qilib ko'rasiz.

Bu — 5-C bosqichdagi "IP larni qo'lda yozib chiqish" ishini bir necha marta qisqartiradi.

**Bilib qo'yish kerak:**
- Skan **faqat `bridge` rejimida** ishlaydi — bulutdagi server klub tarmog'ini ko'rmaydi.
- Skan **10–30 soniya** davom etadi; natija serverda oxirgi skan bo'yicha saqlanadi (yangi skan uni
  almashtiradi). Agent javob bermasa vazifa **3 daqiqadan** keyin bekor bo'ladi.
- Faqat **HTTP javob beradigan** qurilmalar topiladi: **Shelly, Tasmota, ESPHome**.
  **Zigbee/MQTT, Modbus va USB** relelar bu skanda **hech qachon topilmaydi** — ular boshqa
  protokolda ishlaydi, ularni qo'lda kiritasiz.
- Parol qo'yilgan qurilma ham ro'yxatga tushadi (modeli aniqlanmasligi mumkin) — parolni
  keyin qo'lda kiritasiz.
- Boshqa quyi tarmoqni tekshirish uchun `subnet` maydoniga uni yozing: masalan `192.168.10`.

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
- Yoki drayver holatni umuman qaytarmaydi (`http`, `tcp`, `serial`) — bu normal holat (6.8)
- Bu holat **hech narsani buzmaydi** — shunchaki holat hali ma'lum emas degani

### 7.12 MQTT: agent brokerga ulanmayapti yoki chiroq yonmayapti

1. **Broker ishlayaptimi?**
   - Linux: `systemctl status mosquitto`
   - Windows: `Services` (`services.msc`) → `Mosquitto Broker` → `Running` bo'lsin
2. Agent `.env` faylida `MQTT_URL`, `MQTT_USER`, `MQTT_PASS` to'g'ri yozilganmi?
   URL formati aynan `mqtt://192.168.1.10:1883` bo'lsin (`http://` **emas**). Broker agent bilan
   bitta kompyuterda bo'lsa — `mqtt://127.0.0.1:1883`.
3. **Qo'lda tekshiring** (bridge kompyuterdan):
   ```bash
   mosquitto_pub -h 127.0.0.1 -u billiard -P <parol> -t 'zigbee2mqtt/stol3/set' -m '{"state":"ON"}'
   ```
   Chiroq yonsa — muammo agentda emas, dasturdagi `topic`/`onPayload` da.
4. **`Connection Refused: not authorised`** — parol xato, yoki `allow_anonymous false` qo'yilgan-u
   foydalanuvchi yaratilmagan (`mosquitto_passwd`, 5-I bosqich).
5. **Topic xato.** Zigbee2MQTT da qurilma nomi o'zgartirilsa topic ham o'zgaradi —
   aniq nomni frontend (`http://<bridge-IP>:8080`) dan oling. Topic da `#` va `+` bo'lmasin.
6. **Payload xato.** Zigbee2MQTT `{"state":"ON"}` kutadi, Tasmota — oddiy `ON`. Noto'g'ri payload
   da broker **xato bermaydi**, qurilma shunchaki e'tibor bermaydi — shuning uchun "hammasi
   yaxshi ko'rinadi, lekin chiroq yonmaydi" holati chiqadi.
7. **Zigbee relesi tarmoqdan tushib qolgan.** Z2M frontend da `Last seen` ustuniga qarang;
   kerak bo'lsa releni qayta juftlang. Uzoq stol koordinatorga yetmasa — oradagi rozetkaga
   Zigbee repeater (yoki doim tokda turadigan Zigbee qurilma) qo'ying.
8. **Firewall** 1883-portni bloklamayaptimi (Windows Defender → Private tarmoq uchun ruxsat).
9. **Rejim `bridge` mi?** `direct` rejimda `mqtt` ishlamaydi — dastur bunday drayverni saqlashga
   ruxsat ham bermaydi.
10. Broker va Zigbee2MQTT bitta kompyuterda bo'lsa, u kompyuter qayta yuklangandan keyin ikkala
    xizmat ham **avtomatik ishga tushishi** kerak (`systemctl enable`, Docker `--restart=always`).

### 7.13 Modbus plata javob bermayapti

1. Plata quvvat olayaptimi (24 V), LAN kabeli ulanganmi, `LINK` indikatori yonyaptimi?
2. `ping 192.168.1.80` — javob bo'lmasa IP boshqa. Ishlab chiqaruvchining konfigurator dasturi
   bilan qurilmani tarmoqdan qidiring.
3. **502-port ochiqmi:**
   ```bash
   nc -vz 192.168.1.80 502              # Linux
   ```
   ```powershell
   Test-NetConnection 192.168.1.80 -Port 502    # Windows
   ```
4. **`unitId` (slave address)** to'g'rimi? Standart `1`, lekin plataning DIP-switch i bilan
   o'zgartirilgan bo'lishi mumkin.
5. **Koil raqami — eng ko'p uchraydigan xato.** Ba'zi platada 1-rele = `0`, ba'zilarida = `1`.
   `coil` ni `0` va `1` bilan navbat bilan sinab ko'ring.
6. **Bir vaqtda bitta ulanish.** Arzon platalarning ko'pi faqat bitta TCP ulanishni qabul qiladi —
   konfigurator dasturi, Modbus Poll yoki boshqa terminal ochiq qolgan bo'lsa **yoping**.
7. Plata "osilib qolgan" bo'lishi mumkin — quvvatdan 10 soniya uzib, qayta ulang.
8. **RS-485 konverter** orqali ulangan bo'lsa: baud rate va parity mos kelsin, `A`–`A` / `B`–`B`
   simlar to'g'ri ulansin, liniya oxiriga 120 Ω rezistor qo'yilsin.
9. Agent logida `timeout` chiqsa — plata boshqa VLAN da qolib ketmaganmi? Agent bilan plata
   bir-birini ko'rishi shart.

### 7.14 COM port topilmadi (USB rele ishlamayapti)

1. Plataning quvvat indikatori yonyaptimi? Kabel butunmi (ba'zi arzon USB kabellar faqat
   quvvat beradi, ma'lumot simlari yo'q)?
2. **Windows:** `Device Manager → Ports (COM & LPT)` da `USB-SERIAL CH340` bormi?
   - Sariq undov belgisi yoki `Unknown device` → CH340 drayveri o'rnatilmagan (`CH341SER.EXE`)
   - Port raqamini (`COM3`) dasturdagi `serialPort` qiymati bilan solishtiring
3. **Linux:** `ls -l /dev/ttyUSB*` — ko'rinmasa `dmesg | tail` ga qarang
   (`ch341-uart converter now attached to ttyUSB0` chiqishi kerak).
   `Permission denied` bo'lsa — foydalanuvchi `dialout` guruhida emas (5-K bosqich).
4. **Port band:** `Access denied` / `Resource busy` — portni boshqa dastur ushlab turibdi
   (Arduino IDE, plata konfiguratori, terminal dasturi). Ularni yoping va agentni qayta ishga tushiring.
5. **Port raqami o'zgargan** — plata boshqa USB uyasiga ulangan. Doimiy raqam bering (5-K) yoki
   Linux da `/dev/serial/by-id/...` yo'lini ishlating.
6. **`serialport paketi o'rnatilmagan`** xatosi — agent papkasida `npm i serialport` bajaring va
   agentni qayta ishga tushiring.
7. Buyruq baytlari (`onHex` / `offHex`) va `baudRate` (odatda `9600`) plata pasportiga mos kelyaptimi?
   Noto'g'ri bayt yuborilsa plata **jim qoladi** — xato ham chiqmaydi.
8. USB rele **faqat agent ishlayotgan kompyuterga** ulangan bo'lishi kerak. Boshqa kompyuterga
   ulangan bo'lsa — agent uni umuman ko'rmaydi.

### 7.15 "Qurilmalarni qidirish" hech narsa topmadi

1. **Bridge onlaynmi?** Skanni faqat agent bajaradi — `off` va `direct` rejimlarida ishlamaydi.
2. Agent versiyasi eskimi? Discover funksiyasi **2.0.0** va undan yuqori agentda bor.
3. Bridge kompyuter relelar bilan **bitta tarmoqdami**? Mehmon Wi-Fi (guest) tarmog'ida
   qurilmalar bir-birini ko'rmaydi.
4. Router yoki access pointda **"AP isolation" / "Client isolation"** yoqilgan bo'lsa — o'chiring.
5. Tarmoq boshqa oralig'da bo'lishi mumkin — `subnet` maydoniga qo'lda yozing: `192.168.10`.
6. Faqat **Shelly, Tasmota, ESPHome** topiladi. Zigbee/MQTT, Modbus va USB relelar
   **hech qachon topilmaydi** — ularni qo'lda kiriting (6.10).
7. Antivirus yoki firewall agentning ko'p sonli qisqa so'rovlarini "skanerlash" deb bloklashi
   mumkin — `node.exe` ga ruxsat bering.
8. Skan 10–30 soniya davom etadi: darhol bo'sh ko'rinsa, biroz kutib ro'yxatni yangilang.

---

## 8. Xarajat jadvali

> **Narxlar taxminiy, 2026 yil holatiga ko'ra, AQSh dollarida.**
> Jihoz va montaj alohida ko'rsatilgan. Yetkazib berish va bojxona kiritilmagan.

### 8.1 Umumiy (har qanday variantda kerak) — bir marta

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
| Wi-Fi to'lib ketgan / zal katta | **Variant D** (Zigbee) |
| 12+ stol, sanoat darajasidagi ishonchlilik | **Variant E** (Modbus TCP) |
| 1–4 stol, kassa PC stollarga yaqin | **Variant F** (USB rele) |

> **D, E, F variantlari** yuqoridagi 8.2–8.4 jadvallariga kiritilmagan (ular maxsus holatlar uchun).
> Taxminiy qiyoslash: **D** — 8 stolga ~110–160 $, **E** — 16 kanalga ~100–140 $,
> **F** — 4 stolga ~20–35 $. Bularga 8.1-bo'limdagi umumiy xarajat, shchit/kabel va
> elektrik ishi qo'shiladi (montaj narxi A yoki B variantidagidek qoladi).

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

**S: O'yin tugashi bilan chiroq darhol o'chib qolsa noqulay-ku?**
J: Shuning uchun **"Sessiya tugagach yoniq qolsin"** sozlamasi bor (6.5): chiroq siz belgilagan
muddat davomida (masalan 90 soniya) yonib turadi — mijoz hisob-kitob qiladi, xodim sharlarni
yig'ib, stolni tozalaydi, keyin chiroq o'zi o'chadi. Standart qiymat `0` (darhol o'chadi),
tavsiya — **60–180 soniya**. Kutish shart bo'lmasa, kassir qo'lda darhol o'chira oladi.

**S: Mijoz bron qilgan bo'lsa, u kelguncha stol qorong'i turadimi?**
J: **"Bron oldidan yoqilsin"** sozlamasini yoqing (6.6) — bron boshlanishidan, masalan,
10 daqiqa oldin chiroq avtomatik yonadi va mijoz kelganda stol tayyor, yoritilgan bo'ladi.
Mijoz kelmasa ham xavotir yo'q: bron vaqti o'tib ketgach chiroq o'zi o'chadi.

**S: Zal yopilayotganda har stol chirog'ini bittalab o'chirish kerakmi?**
J: Yo'q. **Master tugmalar** bor (6.7): "Hammasini o'chirish", "Hammasini yoqish" va
"Avtomatikaga qaytarish". Bir bosishda butun zal boshqariladi, muddat tanlanadi (30/60/120 daqiqa),
tugma tasodifan bosilmasligi uchun tasdiq so'raydi. Muddat tugagach tizim odatdagi
avtomatik rejimga qaytadi.

**S: Dastur chiroq haqiqatan yonganini biladimi, yoki shunchaki buyruq yuboradimi?**
J: Ko'p qurilmalarda **haqiqatan biladi**. "Holatni tekshirish" (verify) yoqiq bo'lsa (standart
holatda yoqiq), agent har majburiy sinxronizatsiyada qurilmadan holatni **o'qib oladi** va
kerakli holatdan farq qilsa darhol tuzatadi — bu diagnostika jurnalida `drift` deb ko'rinadi (6.8).
Shelly, Tasmota, ESPHome, Home Assistant, Modbus va `stateTopic` li MQTT qurilmalarida ishlaydi;
`http`, `tcp` va USB (`serial`) relelarda esa qurilma javob qaytarmagani uchun ishlamaydi —
u yerda dastur faqat "buyruq yuborildi" deb biladi.

**S: Wi-Fi ga 10 tadan ortiq rele sig'maydi / ular uzilib turadi. Nima qilay?**
J: Uchta yo'l bor: **Variant B** — Shelly Pro 4PM ni LAN kabeli bilan ulash (eng ishonchli);
**Variant D** — Zigbee ga o'tish (relelar bir-biriga signal uzatadi, Wi-Fi umuman band bo'lmaydi);
**Variant E** — Modbus TCP sanoat platasi (12+ stol uchun eng arzon va eng bardoshli).
Uchalasi ham 2-bo'limda batafsil yozilgan.

**S: Relelarning IP sini bittalab qidirib chiqish shartmi?**
J: Yo'q. **"Qurilmalarni qidirish"** tugmasi klub tarmog'ini skanerlab, Shelly / Tasmota / ESPHome
qurilmalarini o'zi topadi va har birini bir bosishda stolga biriktirib beradi (6.10).
Zigbee, Modbus va USB relelar bu ro'yxatga tushmaydi — ular boshqa protokolda ishlaydi,
ularni qo'lda kiritasiz.

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
**xususiy IP** larga (10.x, 172.16–31.x, 192.168.x) murojaat qila oladi — bu SSRF himoyasi.
Serverning o'z loopbacki (127.x) ataylab **taqiqlangan**: rele u yerda turmaydi, ruxsat esa
serverning ichki portlarini tekshirish yo'lini ochib qo'yardi.

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
