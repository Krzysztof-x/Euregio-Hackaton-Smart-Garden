# Smart Garden – Dashboard

A React dashboard that shows the live sensor data of the [Smart Garden](https://github.com/Krzysztof-x/Euregio-Hackaton-Smart-Garden) project, with AI plant care and a plant assistant chatbot.

- **Temperature and air humidity** come from the Raspberry Pi (`rpi/smart_garden_mqtt.py`).
- **Soil moisture and brightness** come from the ESP32 (`esp32_soil/main.py`).
- **My plant:** enter which plant grows there (e.g. "cactus"). The AI creates a care plan with the healthy range for every sensor, and the dashboard warns you when something should change.
- **Weather:** the forecast for your garden (Open-Meteo, free, no key) with tips for your plant, e.g. "Thunderstorm today at 16:00 – bring the plant inside".
- **Plant assistant:** click the button at the bottom right to ask plant questions. Gemini answers in the selected language and knows the current sensor values and your plant.
- **Light / dark mode** and **English / Deutsch / Nederlands**, switchable at the top right. Both choices are remembered.
- Every card has a chart (hover it, or use the arrow keys) and a **table view** (the icon at the top right of the card).
- The **device list** at the bottom shows whether the Pi, the ESP32 and the broker are online.

## How the data gets here

```
Raspberry Pi (192.168.1.45) ──┐
                              ├── MQTT :1883 ──► Mosquitto (192.168.1.207) ── WebSocket :9001 ──► this dashboard
ESP32 (soil + light) ─────────┘
```

Browsers can't use normal MQTT (port 1883), so the dashboard connects to the broker's **WebSocket listener on port 9001**. The broker must be started with the `mosquitto.conf` from the repo, which already has that listener:

```bash
mosquitto -c mosquitto.conf
```

| Topic | Example | Sent by |
|---|---|---|
| `smartgarden/temperature` | `21.6` | Pi, every 10 s |
| `smartgarden/humidity` | `71` | Pi, every 10 s |
| `smartgarden/moisture` | `{"moisture": 80.5, "voltage": 1.41, "raw": 27974}` | ESP32, every 5 s |
| `smartgarden/light` | `{"percent": 37.6, "voltage": 2.06, "raw": 40924}` | ESP32, every 5 s |

## Setup

You need [Node.js](https://nodejs.org) 20.12 or newer.

1. Install the packages:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and put your Gemini API key in it (`GEMINI_API_KEY=...`). **Never commit `.env`**. It's in `.gitignore`, and the GitHub repo is public.

3. Start it:

   ```bash
   npm run dev
   ```

Then open http://localhost:5173. Other devices on the same network (for example a phone) can open `http://<IP of this PC>:5173`.

## My plant + notifications

1. Type your plant into **My plant** (or click an example) and press **Create care plan**.
2. The AI (Gemini) answers **once** with a care plan: how to water, how much sun, tips, and the healthy range for soil moisture, brightness, temperature and air humidity. It gives these ranges on the scales of *our* sensors, so a cactus gets e.g. 5–25 % soil moisture and a tomato a much wetter range.
3. From then on the dashboard compares the live values with these ranges **by itself, without AI**. So notifications never use up the free Gemini quota.

- **Now vs. target** in the plant card shows each sensor's current value next to the plant's range: OK / Too low / Too high.
- **The chart bands** show the plant's range in every chart.

### How notifications trigger

The dashboard checks everything **every second** (no AI involved):

| What | When you get notified |
|---|---|
| A value is outside the plant's range | **Instantly.** Also right after you set or change the plant: you get its full current state at once. |
| Light too low / too high | Only 9:00–18:00, based on the 5-minute average, so a passing cloud doesn't count. |
| A device stops sending (Pi: temperature + humidity, ESP32: soil + light) | After **60 s** without data, e.g. "ESP32 not sending – Missing: Brightness – no data since 00:21". Also works if just one sensor is missing. Right after opening the page, the dashboard waits 15 s for fresh data; if the device has been silent for longer, it's reported then. |
| The MQTT broker can't be reached | After **30 s**. Then only this one message, not one per sensor. |

You're notified **once per problem**:

- **Combined messages:** several new problems at once become one message ("Cactus: 2 things need attention").
- **Reminder:** if a problem is still there after 6 hours, you get one reminder.
- **Solved:** a problem only counts as solved after it has been gone for 3 minutes. A value jumping around a limit (24.9 → 25.1 → 24.9 %) doesn't spam you, and a problem that really comes back is reported again.

Where you see them:

- **Bell** (top right) and the **browser tab title**, e.g. `(2) Smart Garden`. Always.
- **Notification cards** at the top of the page. Always, on every device. Serious ones (device down, broker offline, storm) stay until you close them; the others disappear after 12 s.
- **Pop-up notifications** (like from an app): after clicking **Turn on notifications** in the bell panel. Browsers only allow these on `localhost` or `https`.

The checks run in the browser, so notifications only come while a dashboard tab is open somewhere.

- **Same plant everywhere:** the plan is saved on the server (`server/plant.json`), so every device sees the same plant. Asking for a plant again (e.g. switching back to "cactus") reuses the saved plan and costs no AI request.

All numbers (offline times, light hours, reminder time, …) are in [`src/config.ts`](src/config.ts). What the sensors read (e.g. "a dark room reads ~35–40 % brightness") is at the top of [`server/plant.js`](server/plant.js). Adjust it if you calibrate the sensors, then create the plan again.

## Weather + tips

1. In the **Weather** card, search your town (or click **Use my location**, which works on localhost/https). The location is saved on the server (`server/settings.json`), so every device uses it.
2. Choose whether **the plant is outside or inside**.
3. The card shows the weather now, the next hours and 3 days, plus **tips for your plant** for the next 24 hours:

| Weather | Tip (plant outside) | Level |
|---|---|---|
| Thunderstorm / hail / snow | Bring the plant inside | critical |
| Gusts ≥ 50 km/h (≥ 75 = critical) | Bring it inside or secure the pot | warning |
| Frost (≤ 0 °C) | Bring it inside | critical |
| Colder than the plant's minimum (e.g. cactus 15 °C) | Bring it inside for the night | warning |
| Hotter than the plant's maximum | Shade, check the soil more often | warning |
| Rain ≥ 5 mm and the plant likes dry soil (e.g. cactus) | Put it under a roof | warning |
| Heavy rain ≥ 15 mm | Let water drain, don't water | warning |
| Rain ≥ 2 mm | You can skip watering | info |
| UV ≥ 7 and a shade plant | Give shade at midday | warning |

- **Plant inside:** there are no warnings. Instead it says when the weather is nice enough to put the plant outside.
- **Notifications:** warnings and critical tips also go to the bell, the notification cards and pop-ups, like the sensor alerts.
- **Chat:** the forecast is sent with every question, so you can ask "Can my plant stay outside tomorrow?".
- **No AI:** these are plain rules, so there are no AI costs. The limits are in `WEATHER_LIMITS` in [`src/weather.ts`](src/weather.ts).
- **Data:** weather data by [Open-Meteo.com](https://open-meteo.com/) (free for non-commercial use), refreshed every 15 minutes. It needs an internet connection.

## Plant assistant (Gemini)

The browser never sees the API key. It sends questions to our own small server (`server/chat.js`), and only that server talks to Gemini. In development this server runs inside `npm run dev`.

**Free limit protection:** the server counts every AI request (chat questions and care plans) from all users together:

- **20 questions per day** in total. The count resets at midnight Pacific time, like Google's quota, and it survives a server restart (`server/usage.json`).
- **5 questions per minute.**
- Requests over the limit never reach Google. The chat shows how many questions are left today.
- If Google is overloaded (HTTP 503 "high demand"), the server tries once more after 2 seconds. That attempt counts too.

Google doesn't publish one fixed free limit anymore; it depends on your project. Check yours at [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Only if it allows more, raise `CHAT_LIMIT_PER_DAY` / `CHAT_LIMIT_PER_MINUTE` in `.env`.

**Model:** `gemini-2.5-flash` is no longer available to new API keys (Google answers "no longer available to new users"), so the assistant uses `gemini-3.8-flash`, the model Google recommends instead. You can change it with `GEMINI_MODEL` in `.env`.

## Settings

- **Dashboard:** [`src/config.ts`](src/config.ts) has the broker address, the Pi's IP, the topics, when a sensor counts as offline, and the "too dry / very wet" limits for soil moisture.
- **AI:** [`server/gemini.js`](server/gemini.js) has the model and the free limits, [`server/chat.js`](server/chat.js) the chat instructions, and [`server/plant.js`](server/plant.js) the care plan instructions and sensor scales.
- **Values in `.env`:** see `.env.example`.

## Run it for everyone (e.g. on the Raspberry Pi)

```bash
npm run build
```

```bash
npm start
```

`npm start` serves the dashboard **and** the AI features on port 8080, for example http://192.168.1.45:8080 on the Pi. The `.env` file with the API key must be on that computer too.

Use **http**, not https. Browsers block the unencrypted `ws://` broker connection on https pages.

## Project structure

```
server/
  api.js                  all /api routes
  gemini.js               Gemini request, model, free limits, usage counter (usage.json)
  chat.js                 plant assistant chat
  plant.js                "My plant" care plan from the AI (saved in plant.json)
  settings.js             garden location + plant outside/inside (saved in settings.json)
  index.js                production server (npm start): dashboard + API
src/
  config.ts               dashboard settings (IPs, topics, limits)
  i18n/translations.ts    all texts in en / de / nl
  i18n/LanguageProvider.tsx  language switch + number & time formatting
  hooks/useGardenData.ts  MQTT connection, reads the messages, keeps the history
  hooks/useChat.ts        sends chat questions to server/chat.js
  hooks/usePlant.ts       loads / creates the care plan
  alerts.ts               checks sensors, devices, broker and weather warnings (no AI)
  weather.ts              Open-Meteo forecast + weather tips for the plant (no AI)
  hooks/useAlerts.ts      alert texts + pop-up notifications
  hooks/useTheme.ts       light / dark mode
  components/             header, sensor cards, charts, table, device list, chat
  styles.css              all styling; colors for both modes are at the top
```

**Adding a text or language:** add the text to `en` in `src/i18n/translations.ts`. TypeScript then shows an error until you add it to `de` and `nl` too.
