# Billiard Club — Bridge agenti (chiroq boshqaruvi) — v2

Bu kichik dastur **klubning o'z tarmog'ida** ishlaydi va bulutdagi server (`billiardclub.uz`) bilan
lokal relelar (Shelly, Tasmota, ESPHome, MQTT, Modbus, USB rele) o'rtasida ko'prik vazifasini bajaradi.

## Nega kerak?

Server internetda, relelar esa klubning ichki tarmog'ida (`192.168.x.x`) — router ortida turadi.
Bulutdagi server ularga to'g'ridan-to'g'ri murojaat qila olmaydi.

Bridge agenti muammoni hal qiladi: **u serverga o'zi chiqadi** (oddiy chiquvchi HTTPS so'rov).
Shu sababli:

- routerni sozlash **shart emas**,
- port forwarding **shart emas**,
- statik "oq" IP **shart emas**,
- klub tarmog'i tashqaridan ochilmaydi — xavfsiz.

Ish sxemasi:

```
 [ billiardclub.uz ]  <--- HTTPS (agent o'zi so'raydi) ---  [ Bridge agenti ]  ---> [ Rele 192.168.1.51 ]
        server                                                klubdagi kompyuter          [ MQTT broker    ]
                                                                                          [ USB rele COM3  ]
```

Agent har doim serverdan "qaysi stolda chiroq yoniq bo'lishi kerak" degan ro'yxatni oladi
(o'zgarish bo'lmasa so'rov 25 soniya "osilib" turadi — bu tarmoqni band qilmaydi),
o'zgargan relelargagina buyruq yuboradi va natijani serverga qaytaradi.

### v2 da nima yangi?

| Imkoniyat | Tavsif |
|---|---|
| Yangi drayverlar | `esphome`, `home_assistant`, `mqtt`, `modbus_tcp`, `tcp`, `serial` (USB rele) |
| Digest auth | Shelly Gen2/Plus/Pro parolli rejimi qo'llab-quvvatlanadi |
| Qayta urinish | Har bir relega **3 martagacha** (0 ms / 400 ms / 1200 ms) |
| Parallellik | Bir vaqtda **≤8** qurilma — sekin rele qolganlarini kutkazmaydi |
| Holatni tekshirish | Majburiy sinxronizatsiyada rele holati **o'qib** solishtiriladi, farq bo'lsa darhol tuzatiladi |
| Disk keshi | `state.json` — internet yo'q bo'lsa ham qayta ishga tushganda oxirgi holat qo'llanadi |
| Qurilma qidirish | Paneldagi tugma bilan LAN skanerlanadi (Shelly / Tasmota / ESPHome topiladi) |
| Ko'p kanal | Bitta stolda 2–3 lampa (`channels`) — barchasiga ketma-ket buyruq |

---

## 1. Talablar

- **Node.js 18 yoki undan yuqori**. Majburiy npm paketlar YO'Q — hech narsa o'rnatish shart emas.
  (Faqat **USB rele** ishlatilsa ixtiyoriy `serialport` paketi kerak — 8-bo'limga qarang.)
- Doim yoqiq turadigan qurilma: klubdagi kassa kompyuteri, mini-PC yoki Raspberry Pi.
- Bu qurilma relelar bilan **bir tarmoqda** bo'lishi (ya'ni `192.168.1.51` ga ping ketishi) kerak.
- Internetga chiqish (faqat chiquvchi 443-port).

---

## 2. Tokenni olish

1. Saytga klub egasi (admin) sifatida kiring.
2. **Sozlamalar -> Chiroq boshqaruvi** bo'limiga o'ting.
3. Rejimni **Bridge** qilib tanlang va **"Token yaratish"** tugmasini bosing.
4. Token **faqat bir marta** ko'rsatiladi — darhol nusxalab oling.
   Yo'qotsangiz, eskisini bekor qilib yangisini yaratasiz.

---

## 3. Windows da o'rnatish

### 3.1. Node.js o'rnatish

1. https://nodejs.org saytiga kiring, **LTS** versiyasini yuklab oling (`.msi`).
2. O'rnatuvchini ishga tushiring — barcha bosqichlarda **Next** (standart sozlamalar yetarli).
3. Tekshirish: **Win + R** -> `cmd` -> Enter, so'ng yozing:

   ```
   node -v
   ```

   `v18.x` yoki undan yuqori chiqsa — hammasi joyida.

### 3.2. Papkani joylashtirish

1. `bridge` papkasini kompyuterga nusxalang, masalan: `C:\billiardclub-bridge`
   (ichida `agent.js`, `lib\` papkasi, `package.json`, `.env.example` bo'lishi kerak).
2. `.env.example` faylini o'sha papkaning ichida nusxalab, nomini **`.env`** ga o'zgartiring.

   > Eslatma: Windows kengaytmalarni yashirishi mumkin. Fayl nomi `.env.txt` emas, aynan `.env`
   > bo'lishi shart. Buni ta'minlash uchun `cmd` da:
   > ```
   > cd C:\billiardclub-bridge
   > copy .env.example .env
   > notepad .env
   > ```

3. `.env` faylini to'ldiring (eng kamida):

   ```
   SERVER_URL=https://billiardclub.uz
   BRIDGE_TOKEN=saytdan olgan tokeningiz
   LOG_LEVEL=info
   ```

### 3.3. Qo'lda sinab ko'rish

`cmd` yoki PowerShell da:

```
cd C:\billiardclub-bridge
npm start
```

(`npm start` ishlamasa `node agent.js` deb ham ishga tushirsa bo'ladi — natija bir xil.)

To'g'ri ishlayotgan bo'lsa quyidagiga o'xshash loglar chiqadi:

```
[2026-08-03 18:30:05] [INFO] Billiard Club bridge agenti v2.0.0 ishga tushdi (Node 20.11.1)
[2026-08-03 18:30:05] [INFO] Server: https://billiardclub.uz | Token: A7f2...9dQx
[2026-08-03 18:30:05] [INFO] forceSync: 60000 ms | qurilma timeouti: 3000 ms | log: info
[2026-08-03 18:30:06] [INFO] Yangi holat versiyasi: 9c1a...
[2026-08-03 18:30:06] [INFO] stol #1: chiroq YONDI (shelly_gen1)
```

Saytdagi **Sozlamalar -> Chiroq boshqaruvi** sahifasida bridge holati **"onlayn"** ga o'zgarishi kerak.
To'xtatish: `Ctrl + C`.

### 3.4. Avtomatik ishga tushirish — 1-usul: Vazifalar rejalashtiruvchisi (oson)

1. **Win + R** -> `taskschd.msc` -> Enter.
2. O'ng paneldan **"Create Task..."** (Vazifa yaratish) ni tanlang (Basic Task emas!).
3. **General** yorlig'i:
   - Name: `Billiard Club Bridge`
   - **"Run whether user is logged on or not"** ni belgilang (foydalanuvchi kirmagan bo'lsa ham ishlaydi).
   - **"Run with highest privileges"** ni belgilang.
4. **Triggers** yorlig'i -> **New...**:
   - Begin the task: **At startup** (kompyuter yoqilganda).
   - Advanced settings: **Delay task for: 30 seconds** (tarmoq ko'tarilishini kutish uchun).
   - OK.
5. **Actions** yorlig'i -> **New...**:
   - Action: **Start a program**
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `agent.js`
   - Start in: `C:\billiardclub-bridge`
   - OK.
6. **Conditions** yorlig'i:
   - **"Start the task only if the computer is on AC power"** belgisini **olib tashlang**
     (noutbukda batareyada ham ishlashi uchun).
7. **Settings** yorlig'i:
   - **"If the task fails, restart every:"** -> `1 minute`, **Attempt to restart up to:** `999` times.
   - **"Stop the task if it runs longer than"** belgisini **olib tashlang** (agent doim ishlashi kerak).
8. OK -> Windows parolingizni so'raydi, kiriting.
9. Vazifalar ro'yxatidan `Billiard Club Bridge` ni tanlab, o'ng tugma -> **Run** bilan darhol sinab ko'ring.

> Loglarni ko'rish uchun bu usulda oyna ochilmaydi. Kerak bo'lsa `Actions` da Program/script sifatida
> `cmd.exe`, argument sifatida `/c node agent.js >> agent.log 2>&1` yozing.

### 3.5. Avtomatik ishga tushirish — 2-usul: NSSM orqali Windows xizmati (ishonchliroq)

NSSM — dasturni haqiqiy Windows xizmatiga (service) aylantiruvchi bepul vosita.

1. https://nssm.cc/download dan `nssm` arxivini yuklab oling, ochib `win64\nssm.exe` ni
   `C:\billiardclub-bridge` ichiga nusxalang.
2. **Administrator nomidan** `cmd` ochib:

   ```
   cd C:\billiardclub-bridge
   nssm install BilliardClubBridge
   ```

3. Ochilgan oynada:
   - **Application** yorlig'i:
     - Path: `C:\Program Files\nodejs\node.exe`
     - Startup directory: `C:\billiardclub-bridge`
     - Arguments: `agent.js`
   - **Details** yorlig'i: Display name: `Billiard Club Bridge`
   - **I/O** yorlig'i (loglarni faylga yozish uchun):
     - Output (stdout): `C:\billiardclub-bridge\agent.log`
     - Error (stderr): `C:\billiardclub-bridge\agent.log`
   - **Exit actions** yorlig'i: Restart -> Delay: `5000` ms
   - **Install service** tugmasini bosing.
4. Xizmatni boshqarish:

   ```
   nssm start BilliardClubBridge     :: ishga tushirish
   nssm status BilliardClubBridge    :: holatini ko'rish
   nssm restart BilliardClubBridge   :: qayta ishga tushirish
   nssm stop BilliardClubBridge      :: to'xtatish
   nssm remove BilliardClubBridge confirm   :: o'chirish
   ```

5. Loglarni ko'rish: `C:\billiardclub-bridge\agent.log` faylini oching
   (yoki `powershell Get-Content agent.log -Wait -Tail 50`).

> `.env` faylini o'zgartirgandan keyin xizmatni **albatta qayta ishga tushiring**
> (`nssm restart BilliardClubBridge`).

> USB rele ishlatilsa xizmat **haqiqiy foydalanuvchi** nomidan ishlashi kerak
> (NSSM -> **Log on** yorlig'i), aks holda COM portga ruxsat bo'lmasligi mumkin.

---

## 4. Linux / Raspberry Pi da o'rnatish

### 4.1. Node.js o'rnatish

Raspberry Pi OS / Debian / Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v      # v20.x chiqishi kerak
```

### 4.2. Fayllarni joylashtirish

```bash
sudo mkdir -p /opt/billiardclub-bridge
sudo cp -r bridge/* /opt/billiardclub-bridge/     # agent.js, lib/, .env.example ...
cd /opt/billiardclub-bridge
sudo cp .env.example .env
sudo nano .env          # SERVER_URL va BRIDGE_TOKEN ni to'ldiring
sudo chown -R pi:pi /opt/billiardclub-bridge
chmod 600 /opt/billiardclub-bridge/.env    # token faqat egasiga ko'rinsin
```

Sinab ko'rish:

```bash
cd /opt/billiardclub-bridge && node agent.js
```

Loglar chiqsa `Ctrl + C` bilan to'xtating va xizmat qilib o'rnatishga o'ting.

### 4.3. systemd xizmati

`billiardclub-bridge.service` fayli shu papkada tayyor turibdi:

```bash
sudo cp /opt/billiardclub-bridge/billiardclub-bridge.service /etc/systemd/system/
sudo nano /etc/systemd/system/billiardclub-bridge.service   # User= va yo'llarni tekshiring
sudo systemctl daemon-reload
sudo systemctl enable billiardclub-bridge     # kompyuter yonganda avtomatik ishga tushsin
sudo systemctl start billiardclub-bridge
```

Boshqarish buyruqlari:

```bash
sudo systemctl status billiardclub-bridge     # holati
sudo journalctl -u billiardclub-bridge -f     # jonli loglar
sudo systemctl restart billiardclub-bridge    # .env o'zgartirilgandan keyin
sudo systemctl stop billiardclub-bridge
```

`node` boshqa yo'lda bo'lsa (`which node` bilan tekshiring), `ExecStart` dagi
`/usr/bin/node` ni o'sha yo'lga almashtiring.

USB rele ishlatilsa foydalanuvchini `dialout` guruhiga qo'shing va qayta kiring:

```bash
sudo usermod -aG dialout pi
```

---

## 5. Sozlamalar (.env)

| O'zgaruvchi            | Standart      | Tavsif                                                                    |
|------------------------|---------------|---------------------------------------------------------------------------|
| `SERVER_URL`           | — (majburiy)  | Server manzili, masalan `https://billiardclub.uz`                          |
| `BRIDGE_TOKEN`         | — (majburiy)  | Klub sozlamalarida yaratilgan token                                        |
| `FORCE_SYNC_MS`        | `60000`       | Majburiy to'liq tekshirish oralig'i (ms). **Server qiymati ustun turadi**  |
| `LOG_LEVEL`            | `info`        | `info` yoki `debug` (debug — URL/topic lar ham yoziladi)                   |
| `REQUEST_TIMEOUT_MS`   | `5000`        | Serverga so'rov timeouti                                                   |
| `DEVICE_TIMEOUT_MS`    | `3000`        | Bitta relega buyruq timeouti                                               |
| `STATE_FILE`           | `state.json`  | Oxirgi holat keshi (agent papkasida)                                       |
| `CACHE_SECRETS`        | `0`           | `1` bo'lsa rele parollari/tokenlari ham keshga yoziladi (pastga qarang)     |
| `MQTT_URL`             | —             | `mqtt://192.168.1.10:1883` (yoki `mqtts://...`) — faqat `mqtt` drayveri uchun |
| `MQTT_USER`            | —             | Broker logini                                                              |
| `MQTT_PASS`            | —             | Broker paroli — **serverga hech qachon yuborilmaydi**                       |
| `MQTT_CLIENT_ID`       | avtomatik     | Brokerdagi klient nomi                                                     |
| `MQTT_KEEPALIVE_SEC`   | `30`          | Keepalive (10..300)                                                        |
| `SUBNET`               | avtomatik     | Qidiruv uchun tarmoq, masalan `192.168.1`                                  |
| `DISCOVER_TIMEOUT_MS`  | `700`         | Qidiruvda bitta so'rovni kutish                                            |
| `DISCOVER_PARALLEL`    | `32`          | Qidiruvda bir vaqtda tekshiriladigan manzillar                             |

Muhit o'zgaruvchilari `.env` fayldan ustun turadi (systemd `Environment=` yoki
Windows tizim o'zgaruvchilari orqali berish mumkin).

### 5.1. `state.json` va parollar (`CACHE_SECRETS`)

Agent oxirgi ma'lum holatni `state.json` ga yozadi va internet yo'q bo'lganda shuni qayta qo'llaydi.

- **Standart holat (`CACHE_SECRETS=0`)** — faylga rele parollari va Home Assistant tokenlari
  **umuman yozilmaydi**. Internet uzilganda parol talab qiladigan qurilmalar o'tkazib yuboriladi
  (logda: *"N ta qurilma parol talab qiladi — disk keshida parol saqlanmagan..."*).
  Parolsiz qurilmalar (aksariyat klublarda hammasi shunday) odatdagidek boshqariladi.
- **`CACHE_SECRETS=1`** — parollar ham saqlanadi, ya'ni aloqa yo'qolganda **barcha** stollar
  ishlaydi. Fayl faqat egasi uchun (`0600`) yaratiladi, lekin ichida **ochiq parol** bo'ladi.
  Windows da fayl huquqlari cheklanmaydi — papkani boshqa foydalanuvchilarga ochib qo'ymang.

Fayl vaqtinchalik nusxa orqali almashtiriladi (yozish yarim yo'lda uzilsa eski kesh buzilmaydi).

---

## 6. Qo'llab-quvvatlanadigan qurilmalar (drayverlar)

Qurilma turi, IP manzili va qo'shimcha maydonlar **saytdagi stol sozlamalarida** kiritiladi, agentda emas.

| Drayver          | Nima yuboriladi                                              | Holatni o'qish |
|------------------|--------------------------------------------------------------|----------------|
| `shelly_gen1`    | `GET http://{host}/relay/{kanal}?turn=on\|off`               | bor            |
| `shelly_gen2`    | `GET http://{host}/rpc/Switch.Set?id={kanal}&on=true\|false` | bor            |
| `tasmota`        | `GET http://{host}/cm?cmnd=Power{kanal+1}%20ON\|OFF`         | bor            |
| `esphome`        | `POST http://{host}/switch/{entity}/turn_on\|turn_off`       | bor            |
| `home_assistant` | `POST http://{host}/api/services/{domain}/turn_on\|turn_off` | bor            |
| `mqtt`           | `topic` ga `onPayload`/`offPayload` xabari                    | `stateTopic` bo'lsa |
| `modbus_tcp`     | FC5 — `coil` ga yozish                                        | bor (FC1)      |
| `tcp`            | `onHex`/`offHex` baytlari xom TCP orqali                      | yo'q           |
| `serial`         | `onHex`/`offHex` baytlari USB (COM) portga                    | yo'q           |
| `http`           | Sizning `onUrl` / `offUrl` shablonlaringiz                    | yo'q           |

Umumiy qoidalar:

- **`http` shablonlarida** `{channel}` (kanal raqami) va `{state}` (`on` / `off`) o'rinbosarlari ishlaydi.
- **Teskari (inverted)** belgisi — NC (normally closed) relelar uchun: buyruq teskari yuboriladi.
- **Login/parol** kerak bo'lsa — `Authorization: Basic` sarlavhasi orqali yuboriladi,
  parol URL manzilida ochiq ketmaydi. **Shelly Gen2/Plus/Pro** esa `Digest` (SHA-256) usulini
  ishlatadi — agent 401 javobini olgach digestni o'zi hisoblaydi va so'rovni qayta yuboradi.
  Foydalanuvchi nomi Shelly da odatda `admin` (`admin:parol` deb kiritiladi).
- **Home Assistant** da `auth` maydoniga *long-lived access token* yoziladi (login:parol EMAS),
  `entityId` esa `switch.stol_3` ko'rinishida bo'ladi.
- **Ko'p kanal**: stol sozlamalaridagi "qo'shimcha kanallar" (`channels`) to'ldirilsa,
  asosiy kanaldan keyin har biriga ketma-ket buyruq yuboriladi (bitta stolda 2–3 lampa).
  Bu `shelly_*`, `tasmota`, `http`, `modbus_tcp` uchun ishlaydi.

---

## 7. MQTT (Zigbee2MQTT, Tasmota MQTT, Shelly MQTT)

Agentda **o'z minimal MQTT klienti** bor (npm paket kerak emas): MQTT 3.1.1,
QoS 0/1, retain, avtomatik qayta ulanish, keepalive 30 s.

### 7.1. Broker o'rnatish (Mosquitto)

Debian / Raspberry Pi:

```bash
sudo apt-get install -y mosquitto mosquitto-clients
sudo mosquitto_passwd -c /etc/mosquitto/passwd billiard      # parol so'raydi
printf 'listener 1883\nallow_anonymous false\npassword_file /etc/mosquitto/passwd\n' \
  | sudo tee /etc/mosquitto/conf.d/billiard.conf
sudo systemctl restart mosquitto
```

Windows uchun tayyor o'rnatuvchi: https://mosquitto.org/download

### 7.2. Agentni sozlash

`.env` ga qo'shing:

```
MQTT_URL=mqtt://192.168.1.10:1883
MQTT_USER=billiard
MQTT_PASS=parolingiz
```

> Parol **faqat shu faylda** qoladi — serverga hech qachon yuborilmaydi va logga chiqmaydi.
> `mqtts://` (TLS) ham qo'llab-quvvatlanadi; lokal brokerning o'zi imzolagan sertifikati
> qabul qilinadi (klub tarmog'i ichida ishlagani uchun).

### 7.3. Stol sozlamalari (saytda)

| Maydon         | Misol (Zigbee2MQTT)        | Misol (Tasmota MQTT)   |
|----------------|----------------------------|------------------------|
| `topic`        | `zigbee2mqtt/stol3/set`    | `cmnd/tasmota_1/POWER` |
| `onPayload`    | `{"state":"ON"}`           | `ON`                   |
| `offPayload`   | `{"state":"OFF"}`          | `OFF`                  |
| `stateTopic`   | `zigbee2mqtt/stol3`        | `stat/tasmota_1/POWER` |
| `stateOnValue` | `ON`                       | `ON`                   |
| `qos`          | `0` yoki `1`               | `0`                    |
| `retain`       | odatda `off`               | odatda `off`           |

`stateTopic` ko'rsatilsa agent unga obuna bo'ladi va kelgan qiymatni **haqiqiy holat**
sifatida ishlatadi (JSON kelsa `state` / `value` maydoni ichidan ham qidiriladi).

- Mavzuda **joker belgi** (`#` yoki `+`) bo'lmasin — bunday mavzuga obuna bo'linmaydi
  (logda ogohlantirish chiqadi), chunki boshqa stollarning xabarlari holatni chalkashtiradi.
- Buyruq yuborilgandan keyin agent qurilmadan **yangi** holat xabarini qisqa muddat kutadi;
  eski qiymat "haqiqiy holat" deb serverga yuborilmaydi.
- Uzoq vaqt (majburiy sinxronizatsiya oralig'idan ko'p) yangilanmagan holat **eskirgan**
  hisoblanadi — agent uni "haqiqat" deb qabul qilmay, buyruqni qayta yuboradi.

Sinab ko'rish (brokerda xabar ketayotganini tekshirish):

```bash
mosquitto_sub -h 192.168.1.10 -u billiard -P parolingiz -t '#' -v
```

---

## 8. USB rele (`serial` drayveri) — eng arzon yechim

Kassa kompyuteriga USB orqali ulanadigan 4/8 kanalli rele platasi.

1. Paketni o'rnating (faqat shu drayver uchun kerak):

   ```
   cd C:\billiardclub-bridge      # Linux: cd /opt/billiardclub-bridge
   npm install serialport
   ```

   Paket o'rnatilmagan bo'lsa boshqa drayverlar bemalol ishlaydi — faqat shu stolda
   "`serialport` paketi kerak" degan xato ko'rinadi.

2. Port nomini toping:
   - Windows: **Qurilma dispetcheri** -> `Ports (COM & LPT)` -> masalan `COM3`.
   - Linux: `ls /dev/ttyUSB*` yoki `dmesg | tail`.

3. Saytdagi stol sozlamalarida to'ldiring:

   | Maydon       | Misol        |
   |--------------|--------------|
   | `serialPort` | `COM3` yoki `/dev/ttyUSB0` |
   | `baudRate`   | `9600` (odatda), ruxsat etilgan oraliq `300..921600` |
   | `onHex`      | `A0 01 01 A2` |
   | `offHex`     | `A0 01 00 A1` |

   Baytlar plataning qo'llanmasida yoziladi. 2-kanal uchun odatda `A0 02 01 A3` / `A0 02 00 A2`.
   Hex o'rniga matn kerak bo'lsa `onAscii` / `offAscii` ishlatiladi (`\n`, `\r`, `\t`, `\xNN` qo'llanadi).

4. Port bir marta ochiladi va ochiq saqlanadi (har buyruqda qayta ochish ba'zi platalarni
   qayta ishga tushirib yuboradi). Agent to'xtaganda port yopiladi.
   Bitta port bir nechta stolga biriktirilgan bo'lsa ham u **faqat bir marta** ochiladi —
   parallel buyruqlar bir-birining portini yopib qo'ymaydi.
   `baudRate` chegaradan chiqsa jimgina qisqartirilmaydi: stol xato bilan belgilanadi
   (`serial: "baudRate" 300..921600 oralig'ida bo'lishi kerak`).

> USB rele holatini o'qish imkoni yo'q — bu drayverda "holatni tekshirish" (verify) ishlamaydi.

---

## 9. Modbus TCP va xom TCP relelar

- **`modbus_tcp`** — sanoat rele platalari. Sozlamalar: `host` (`192.168.1.60:502`),
  `unitId` (odatda `1`), `coil` (g'altak raqami; ko'rsatilmasa kanal ishlatiladi).
  Agent FC5 (yozish) va FC1 (o'qish) funksiyalarini ishlatadi — holatni tekshirish ishlaydi.
- **`tcp`** — protokolsiz platalar: `host` (`192.168.1.60:8080`) va `onHex`/`offHex`
  (yoki `onAscii`/`offAscii`). `expectHex` ko'rsatilsa javobning bosh baytlari tekshiriladi.

---

## 10. Qurilmalarni qidirish (discover)

Saytda **Sozlamalar -> Chiroq boshqaruvi -> "Qurilmalarni qidirish"** tugmasi bosilganda
server agentga task yuboradi. Agent klub tarmog'ining `1..254` manzillarini ko'rib chiqadi:

1. 80-port ochiqmi (tez tekshiruv),
2. `GET /shelly` — Shelly Gen1/Gen2,
3. `GET /cm?cmnd=Status` — Tasmota,
4. `GET /` — sahifada "ESPHome" bo'lsa.

Topilgan qurilmalar (IP, MAC, model, taxminiy drayver) panelda ro'yxat bo'lib chiqadi va
**"Stolga biriktirish"** tugmasi bilan darhol stolga bog'lanadi.

- Tarmoq **serverga chiqish yo'lidagi interfeys** bo'yicha aniqlanadi (Docker, Radmin/VPN va
  boshqa virtual adapterlar chetlab o'tiladi); noto'g'ri tarmoq tanlansa `.env` da
  `SUBNET=192.168.1` yozing. Skanerlangan tarmoq natija bilan birga serverga yuboriladi.
- Bir vaqtda faqat bitta qidiruv ishlaydi, natija serverda **10 daqiqa** saqlanadi.
  Skan ketayotganda kelgan yangi so'rov **yo'qolmaydi** — navbatda kutadi va keyin bajariladi.
- Ro'yxatda faqat tanilgan qurilmalar chiqadi. Boshqa relelarni qo'lda (IP + drayver) kiritasiz.

---

## 11. Agent qanday ishlaydi (qisqacha)

1. **Uzun-polling** — `GET /api/bridge/state?v=...`; holat o'zgarmasa server javobni 25 s ushlaydi.
   O'yin boshlanishi bilan server javobni darhol qaytaradi va chiroq ~1 soniyada yonadi.
2. **Faqat o'zgarganlar** — buyruq faqat holati o'zgargan stollarga yuboriladi.
3. **Majburiy sinxronizatsiya** — har `FORCE_SYNC_MS` (server sozlamasi, standart 1 daqiqa)
   barcha stollar tekshiriladi. "Holatni tekshirish" yoqilgan bo'lsa avval reledan **haqiqiy holat
   o'qiladi**; u kerakli holatdan farq qilsa (kimdir qo'lda o'chirgan, elektr uzilgan) darhol tuzatiladi.
   Ko'p kanalli stolda **barcha kanallar** o'qiladi — bitta lampa yonmay qolsa ham drift ko'rinadi.
4. **Qayta urinish** — har bir relega 3 martagacha (0 ms, 400 ms, 1200 ms) urinib ko'riladi;
   urinishlar soni va javob vaqti serverga yuboriladi (paneldagi diagnostika jurnalida ko'rinadi).
5. **Parallellik** — bir vaqtda ≤8 qurilma.
6. **Disk keshi** — oxirgi ro'yxat `state.json` ga yoziladi. Internet yo'q bo'lsa (yoki server
   javob bermasa) agent shu holatni qayta qo'llaydi — klub qorong'ida qolmaydi.
7. **Xatolar** — hech qachon jarayonni to'xtatmaydi; `Ctrl+C` / `systemctl stop` toza yakunlaydi.

> `state.json` ga parollar standart holatda **yozilmaydi** (5.1-bo'limga qarang). Fayl faqat egasi
> uchun (`0600`) yaratiladi; Linux da papkani boshqa foydalanuvchilarga ochib qo'ymang.

---

## 12. Diagnostika

### "Bridge offline" ko'rinmoqda (saytda)

Tartib bilan tekshiring:

1. **Agent umuman ishlayaptimi?**
   - Windows: Task Manager -> Details -> `node.exe` bormi. NSSM bilan: `nssm status BilliardClubBridge`.
   - Linux: `sudo systemctl status billiardclub-bridge`.
2. **Loglarda nima yozilgan?**
   - Windows: `agent.log` fayli. Linux: `sudo journalctl -u billiardclub-bridge -n 50`.
3. **`BRIDGE_TOKEN noto'g'ri yoki bekor qilingan (401/403)`** —
   token xato yoki saytda yangisi yaratilgan. Saytdan yangi token oling va `.env` ni yangilang,
   so'ng xizmatni qayta ishga tushiring.
4. **`timeout (javob kelmadi)` yoki `ENOTFOUND` / `ECONNREFUSED`** — internet yoki DNS muammosi:
   ```bash
   ping billiardclub.uz
   curl -I https://billiardclub.uz
   ```
5. **`SERVER_URL` xato yozilgan** — oxirida `/` yoki `/api` bo'lmasin.
   To'g'risi: `https://billiardclub.uz`.
6. **Antivirus / korporativ proksi** chiquvchi so'rovni bloklayotgan bo'lishi mumkin —
   `node.exe` ga ruxsat bering.
7. **`.env` fayli o'qilmayapti** — fayl `agent.js` bilan **bir papkada** va nomi aynan `.env`
   bo'lishi kerak (`.env.txt` emas). `LOG_LEVEL=debug` qo'yib ishga tushiring —
   banner logda `Server:` va `Token:` qiymatlari to'g'ri ko'rinishi kerak.

### Rele javob bermayapti (logda `stol #N: xato — ...`)

1. **`timeout (javob kelmadi)`** — rele o'chgan, IP o'zgargan yoki boshqa tarmoqda:
   ```bash
   ping 192.168.1.51
   ```
2. **IP o'zgarib ketgan** — routerda rele uchun **statik IP (DHCP reservation)** qilib qo'ying.
3. **`HTTP 401`** — releda parol yoqilgan. Stol sozlamalarida `login:parol` ni kiriting
   (Shelly Gen2 da odatda `admin:parolingiz`). Home Assistant uchun esa **token** yoziladi.
4. **`HTTP 404`** — drayver noto'g'ri tanlangan yoki kanal/`entity` xato:
   - Shelly Gen1: `http://IP/relay/0` brauzerda ochilishi kerak.
   - Shelly Gen2: `http://IP/rpc/Switch.GetStatus?id=0`.
   - Tasmota: `http://IP/cm?cmnd=Power1`.
   - ESPHome: `http://IP/switch/relay_1` (nom `esphome` konfiguratsiyasidagi `id` bilan bir xil).
5. **`host formati noto'g'ri`** — host maydoniga `http://` yoki `/` qo'shib yozilgan.
   To'g'risi: faqat `192.168.1.51` yoki `192.168.1.51:8080`.
6. **Chiroq teskari ishlayapti** — stol sozlamalarida **"teskari (NC rele)"** belgisini yoqing.

### MQTT muammolari

1. **`MQTT brokerga ulanmagan`** — `.env` da `MQTT_URL` yo'q yoki broker ishlamayapti:
   ```bash
   systemctl status mosquitto
   mosquitto_sub -h 192.168.1.10 -u billiard -P parol -t '#' -v
   ```
2. **`login yoki parol noto'g'ri`** (CONNACK 4/5) — `MQTT_USER` / `MQTT_PASS` ni tekshiring,
   brokerda `allow_anonymous false` bo'lsa foydalanuvchi yaratilgan bo'lishi kerak.
3. **Xabar ketyapti, lekin chiroq yonmayapti** — `topic` yoki `onPayload` xato.
   Yuqoridagi `mosquitto_sub` bilan qurilmaning o'zi qanday xabar kutayotganini solishtiring
   (Zigbee2MQTT da odatda `.../set` va `{"state":"ON"}`).
4. **Holat "noma'lum"** — `stateTopic` to'ldirilmagan yoki qurilma holatni boshqa mavzuga yozadi.

### Modbus / TCP / USB rele muammolari

1. **`modbus: javob kelmadi (timeout)`** — plata IP/porti xato (`502` standart) yoki
   boshqa dastur ulanishni band qilgan (ko'p platalar 1–4 ta ulanishni qo'llaydi).
2. **`modbus: manzil (coil) noto'g'ri`** — `coil` raqami noto'g'ri; ko'p platalarda 1-kanal `0` yoki `1`.
3. **`tcp: qurilma kutilgan javobni qaytarmadi`** — `expectHex` ni bo'shatib ko'ring
   (hamma plata ham javob qaytarmaydi).
4. **`serial: portni ochib bo'lmadi`** — port nomi xato, boshqa dastur (masalan Arduino IDE)
   portni band qilgan, yoki Linux da huquq yo'q (`sudo usermod -aG dialout pi`).
5. **`serialport` paketi kerak** — `npm install serialport` bajaring (Node 18+ uchun tayyor
   binar yuklanadi, kompilyator kerak emas).

### Foydali eslatmalar

- Agent **hech qachon** o'yin/sessiya jarayoniga ta'sir qilmaydi: chiroq xatosi kassada
  hech narsani to'xtatmaydi, faqat logga va saytdagi holat ustuniga yoziladi.
- Bir klubda **faqat bitta** agent ishlashi kerak.
- Internet uzilganda **parolli** qurilmalar keshdan qo'llanmaydi (parol diskda saqlanmaydi) —
  logda shu haqda yozuv chiqadi. Kerak bo'lsa `.env` da `CACHE_SECRETS=1` qo'ying (5.1-bo'lim).
- Tokenni hech kimga bermang. Shubha bo'lsa saytdan bekor qilib, yangisini yarating.
- Loglarga parol/token **hech qachon** yozilmaydi (token faqat `A7f2...9dQx` ko'rinishida).

---

## 13. Fayllar

| Fayl                          | Vazifasi                                                   |
|-------------------------------|-------------------------------------------------------------|
| `agent.js`                    | Asosiy sikl: server bilan aloqa, sinxronizatsiya, tasklar    |
| `lib/common.js`               | Umumiy yordamchilar (xato matni, host, hex/ASCII, fetch)     |
| `lib/http-device.js`          | Shelly / Tasmota / ESPHome / Home Assistant / http drayveri  |
| `lib/mqtt.js`                 | Minimal MQTT 3.1.1 klienti (paketsiz)                        |
| `lib/modbus.js`               | Modbus TCP (FC5 yozish, FC1 o'qish)                          |
| `lib/rawtcp.js`               | Xom TCP baytlar                                              |
| `lib/serial.js`               | USB rele (ixtiyoriy `serialport`)                            |
| `lib/discover.js`             | LAN skaneri (Shelly / Tasmota / ESPHome)                     |
| `state.json`                  | Oxirgi holat keshi (avtomatik yaratiladi, `0600`, parolsiz)  |
| `package.json`                | `npm start` va ixtiyoriy `serialport`                        |
| `.env.example`                | Sozlamalar namunasi                                          |
| `billiardclub-bridge.service` | systemd xizmati namunasi                                     |
| `README.md`                   | Ushbu qo'llanma                                              |

Sintaksisni tekshirish (o'zgartirgandan keyin):

```
npm run check
```
