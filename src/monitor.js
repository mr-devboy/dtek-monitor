import { chromium } from "playwright"
import path from "node:path"
import {
  CITY_KYIV, STREET_KYIV, HOUSE_KYIV,
  CITY_ODESA, STREET_ODESA, HOUSE_ODESA,
  CITY_DNIPRO, STREET_DNIPRO, HOUSE_DNIPRO,
  CF_WORKER_URL, CF_WORKER_TOKEN,
  LVIV_JSON_URL,
  YASNO_KYIV_URL,
  YASNO_DNIPRO_DNEM_URL,
  YASNO_DNIPRO_CEK_URL
} from "./constants.js"

// --- КОНФІГУРАЦІЯ РЕГІОНІВ (ДТЕК - ОБЛАСТІ) ---
const DTEK_REGIONS = [
  {
    id: "kiivska-oblast",
    url: "https://www.dtek-krem.com.ua/ua/shutdowns",
    city: CITY_KYIV,
    street: STREET_KYIV,
    house: HOUSE_KYIV,
    name_ua: "Київська область",
    name_ru: "Киевская область",
    name_en: "Kyiv Region"
  },
  {
    id: "odeska-oblast",
    url: "https://www.dtek-oem.com.ua/ua/shutdowns",
    city: CITY_ODESA,
    street: STREET_ODESA,
    house: HOUSE_ODESA,
    name_ua: "Одеська область",
    name_ru: "Одесская область",
    name_en: "Odesa Region"
  },
  {
    id: "dnipropetrovska-oblast",
    url: "https://www.dtek-dnem.com.ua/ua/shutdowns",
    city: CITY_DNIPRO,
    street: STREET_DNIPRO,
    house: HOUSE_DNIPRO,
    name_ua: "Дніпропетровська область",
    name_ru: "Днепропетровская область",
    name_en: "Dnipropetrovsk Region"
  }
];

// Допоміжна функція дати
function getKyivDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

// Функція паузи
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. ДТЕК (Playwright) - МАКСИМАЛЬНО НАДІЙНА ВЕРСІЯ
async function getDtekRegionInfo(browser, config) {
  if (!config.city || !config.street || !config.house) {
    console.log(`ℹ️ Skipping DTEK ${config.id}: No address configured.`);
    return null;
  }

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let page = null;
    try {
      console.log(`🌍 Visiting DTEK ${config.id} (Attempt ${attempt}/${MAX_RETRIES})...`);

      // Створюємо контекст з реалістичним User-Agent
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'uk-UA'
      });

      page = await context.newPage();

      // Збільшуємо таймаут навігації до 60 сек
      await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // ⚠️ ВАЖЛИВО: Чекаємо 5 секунд, щоб сайт встиг зробити всі редіректи/перезавантаження
      await sleep(5000);

      // --- Перевірка на екстрені відключення (SMART GLOBAL CHECK) ---
      const isEmergency = await page.evaluate(() => {
        try {
          const attentionBlock = document.querySelector('.m-attention__text');
          if (!attentionBlock) return false;
          const text = attentionBlock.innerText.toLowerCase();

          // 1. Якщо написано "скасовано" або "відновлено" - це не аварія
          if (text.includes("скасовано") || text.includes("відновлено") || text.includes("повертаємось до графіків")) {
            return false;
          }

          // 2. Чи є взагалі слова про відключення?
          const hasKeywords = text.includes("екстрені") || text.includes("аварійні");
          if (!hasKeywords) return false;

          // 3. ФІЛЬТР: Чи це ГЛОБАЛЬНА аварія?
          // Якщо є слово "Укренерго" - це майже завжди розпорядження на всю область/країну.
          if (text.includes("укренерго")) return true;

          // Якщо згадуються локальні маркери - це ЛОКАЛЬНА аварія, ігноруємо її.
          // (Якщо ДТЕК пише "в Бориспільському районі", "в частині громади" тощо)
          if (text.includes("районі") || text.includes("громаді") || text.includes("частині") || text.includes("населеному пункті")) {
            // ⚠️ ВИНЯТОК: Якщо при цьому згадується саме обласний центр - це все ж таки важливо!
            // Наприклад: "в Одеському районі, зокрема в Одесі"
            const mentionsMajorCity = text.includes("київ") || text.includes("києв") ||
              text.includes("одес") || text.includes("дніпр");

            if (!mentionsMajorCity) {
              return false;
            }
          }

          // Якщо слів-маркерів локальності немає, а слова "екстрені/аварійні" є - вважаємо глобальною.
          return true;
        } catch (e) { return false; }
      }).catch(() => false);

      if (isEmergency) {
        console.log(`⚠️ DETECTED GLOBAL EMERGENCY for ${config.id}`);
      }

      // Чекаємо на CSRF токен (ознака того, що сторінка стабільна)
      const csrfTokenTag = await page.waitForSelector('meta[name="csrf-token"]', { state: "attached", timeout: 15000 });
      const csrfToken = await csrfTokenTag.getAttribute("content");

      // Виконуємо AJAX запит
      const info = await page.evaluate(
        async ({ city, street, house, csrfToken }) => {
          const formData = new URLSearchParams();
          formData.append("method", "getHomeNum");
          formData.append("data[0][name]", "city");
          formData.append("data[0][value]", city);
          formData.append("data[1][name]", "street");
          formData.append("data[1][value]", street);
          formData.append("data[2][name]", "house");
          formData.append("data[2][value]", house);
          formData.append("data[3][name]", "updateFact");
          formData.append("data[3][value]", new Date().toLocaleString("uk-UA"));

          const response = await fetch("/ua/ajax", {
            method: "POST",
            headers: { "x-requested-with": "XMLHttpRequest", "x-csrf-token": csrfToken },
            body: formData,
          });
          return await response.json();
        },
        { city: config.city, street: config.street, house: config.house, csrfToken }
      );

      await context.close(); // Закриваємо контекст чисто
      return { ...info, emergency: isEmergency };

    } catch (error) {
      console.warn(`⚠️ Error scraping DTEK ${config.id}: ${error.message}`);

      if (page) await page.close().catch(() => { });

      if (attempt === MAX_RETRIES) {
        console.error(`❌ Failed DTEK ${config.id} giving up.`);
        return null;
      }
      // Чекаємо довше перед наступною спробою
      await sleep(5000 + (attempt * 2000));
    }
  }
}

// 2. ЛЬВІВ (GitHub JSON)
async function getLvivData() {
  console.log(`🌍 Fetching Lviv data...`);
  try {
    const response = await fetch(LVIV_JSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error("❌ Error fetching Lviv data:", e.message);
    return null;
  }
}

// 3. YASNO (З RETRY)
async function getYasnoData(url, label) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🌍 Fetching Yasno ${label} data (Attempt ${attempt})...`);
      const response = await fetch(url);

      if (response.status === 304) {
        console.log(`ℹ️ Yasno ${label}: 304 Not Modified`);
      }

      if (!response.ok && response.status !== 304) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.warn(`⚠️ Error fetching Yasno ${label}: ${e.message}`);
      if (attempt === MAX_RETRIES) return null;
      await sleep(3000);
    }
  }
}

// --- ТРАНСФОРМАЦІЇ ---

function transformToSvitloFormat(dtekRaw) {
  let daysData = null;
  if (dtekRaw?.data?.fact?.data) daysData = dtekRaw.data.fact.data;
  else if (dtekRaw?.fact?.data) daysData = dtekRaw.fact.data;
  else if (dtekRaw?.data) daysData = dtekRaw.data;

  if (!daysData) return {};

  const scheduleMap = {};

  for (const [timestamp, queues] of Object.entries(daysData)) {
    const dateObj = new Date(parseInt(timestamp) * 1000);
    const dateStr = dateObj.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });

    for (const [gpvKey, hours] of Object.entries(queues)) {
      const groupKey = gpvKey.replace("GPV", "");

      if (!scheduleMap[groupKey]) scheduleMap[groupKey] = {};
      if (!scheduleMap[groupKey][dateStr]) scheduleMap[groupKey][dateStr] = {};

      for (let h = 1; h <= 24; h++) {
        const status = hours[h.toString()];
        const hourIndex = h - 1;
        const hh = String(hourIndex).padStart(2, "0");

        let val00 = 1, val30 = 1;
        switch (status) {
          case "yes": val00 = 1; val30 = 1; break;
          case "no": val00 = 2; val30 = 2; break;
          case "first": val00 = 2; val30 = 1; break;
          case "second": val00 = 1; val30 = 2; break;
          default: val00 = 1; val30 = 1;
        }
        scheduleMap[groupKey][dateStr][`${hh}:00`] = val00;
        scheduleMap[groupKey][dateStr][`${hh}:30`] = val30;
      }
    }
  }
  return scheduleMap;
}

function transformYasnoFormat(yasnoRaw) {
  if (!yasnoRaw) return { schedule: {}, emergency: false };

  const scheduleMap = {};
  let isEmergency = false;

  for (const [groupKey, daysData] of Object.entries(yasnoRaw)) {
    if (!scheduleMap[groupKey]) scheduleMap[groupKey] = {};

    for (const dayKey of ["today", "tomorrow"]) {
      const dayInfo = daysData[dayKey];
      if (!dayInfo || !dayInfo.date) continue;

      if (dayInfo.status === "EmergencyShutdowns") {
        isEmergency = true;
      }

      const dateStr = dayInfo.date.substring(0, 10);
      if (!scheduleMap[groupKey][dateStr]) scheduleMap[groupKey][dateStr] = {};

      const slots = dayInfo.slots || [];
      const halfHours = new Array(48).fill(1); // 1 = Світло є

      slots.forEach(slot => {
        let status = 1;
        if (slot.type === "Definite") status = 2;
        else if (slot.type === "Possible") status = 2;

        const startIdx = Math.floor(slot.start / 30);
        const endIdx = Math.floor(slot.end / 30);

        for (let i = startIdx; i < endIdx; i++) {
          if (i >= 0 && i < 48) {
            halfHours[i] = status;
          }
        }
      });

      for (let i = 0; i < 48; i++) {
        const hour = Math.floor(i / 2);
        const minute = (i % 2) === 0 ? "00" : "30";
        const hh = String(hour).padStart(2, "0");
        scheduleMap[groupKey][dateStr][`${hh}:${minute}`] = halfHours[i];
      }
    }
  }

  return { schedule: scheduleMap, emergency: isEmergency };
}

// 4. ГОЛОВНИЙ ЗАПУСК
async function run() {
  console.log("🚀 Starting Multi-Region Scraper (Robust Mode)...");

  const browser = await chromium.launch({ headless: true });
  const processedRegions = [];
  const globalDates = { today: null, tomorrow: null };

  // 1. ДТЕК (ОБЛАСТІ)
  try {
    for (const config of DTEK_REGIONS) {
      await sleep(2000);
      const rawInfo = await getDtekRegionInfo(browser, config);
      if (rawInfo) {
        const cleanSchedule = transformToSvitloFormat(rawInfo);

        // --- ⬇️ ОНОВЛЕНА ЛОГІКА ТУТ ⬇️ ---
        const hasSchedule = Object.keys(cleanSchedule).length > 0;

        // Додаємо регіон, якщо Є графік АБО Є аварійний режим
        if (hasSchedule || rawInfo.emergency) {
          console.log(`✅ Success DTEK: ${config.id} (Emergency: ${rawInfo.emergency})`);

          // Оновлюємо дати тільки якщо є реальний графік
          if (hasSchedule) {
            updateGlobalDates(cleanSchedule, globalDates);
          }

          processedRegions.push({
            cpu: config.id,
            name_ua: config.name_ua,
            name_ru: config.name_ru,
            name_en: config.name_en,
            schedule: cleanSchedule, // Може бути пустим {}, якщо emergency=true
            emergency: rawInfo.emergency || false
          });
        } else {
          console.log(`ℹ️ Skipping DTEK ${config.id}: No schedule and no emergency detected.`);
        }
        // --- ⬆️ КІНЕЦЬ ЗМІН ⬆️ ---
      }
    }
  } catch (err) {
    console.error("DTEK Critical Error:", err);
  } finally {
    await browser.close();
  }

  // 2. ЛЬВІВ
  const lvivRaw = await getLvivData();
  if (lvivRaw) {
    const lvivSchedule = transformToSvitloFormat(lvivRaw);
    if (Object.keys(lvivSchedule).length > 0) {
      console.log(`✅ Success Lviv`);
      updateGlobalDates(lvivSchedule, globalDates);
      processedRegions.push({
        cpu: "lvivska-oblast",
        name_ua: "Львівська область",
        name_ru: "Львовская область",
        name_en: "Lviv Region",
        schedule: lvivSchedule,
        emergency: false
      });
    }
  }

  // 3. YASNO KYIV
  const yasnoKyivRaw = await getYasnoData(YASNO_KYIV_URL, "Kyiv");
  if (yasnoKyivRaw) {
    const { schedule, emergency } = transformYasnoFormat(yasnoKyivRaw);
    if (Object.keys(schedule).length > 0) {
      console.log(`✅ Success Yasno Kyiv (Emergency: ${emergency})`);
      updateGlobalDates(schedule, globalDates);
      processedRegions.push({
        cpu: "kyiv",
        name_ua: "Київ",
        name_ru: "Киев",
        name_en: "Kyiv",
        schedule: schedule,
        emergency: emergency
      });
    }
  }

  // 4. YASNO DNIPRO (DNEM)
  const yasnoDniproDnemRaw = await getYasnoData(YASNO_DNIPRO_DNEM_URL, "Dnipro DNEM");
  if (yasnoDniproDnemRaw) {
    const { schedule, emergency } = transformYasnoFormat(yasnoDniproDnemRaw);
    if (Object.keys(schedule).length > 0) {
      console.log(`✅ Success Yasno Dnipro DNEM (Emergency: ${emergency})`);
      updateGlobalDates(schedule, globalDates);
      processedRegions.push({
        cpu: "dnipro-dnem",
        name_ua: "м. Дніпро (ДнЕМ)",
        name_ru: "г. Днепр (ДнЭМ)",
        name_en: "Dnipro City (DNEM)",
        schedule: schedule,
        emergency: emergency
      });
    }
  }

  // 5. YASNO DNIPRO (CEK)
  const yasnoDniproCekRaw = await getYasnoData(YASNO_DNIPRO_CEK_URL, "Dnipro CEK");
  if (yasnoDniproCekRaw) {
    const { schedule, emergency } = transformYasnoFormat(yasnoDniproCekRaw);
    if (Object.keys(schedule).length > 0) {
      console.log(`✅ Success Yasno Dnipro CEK (Emergency: ${emergency})`);
      updateGlobalDates(schedule, globalDates);
      processedRegions.push({
        cpu: "dnipro-cek",
        name_ua: "м. Дніпро (ЦЕК)",
        name_ru: "г. Днепр (ЦЭК)",
        name_en: "Dnipro City (CEK)",
        schedule: schedule,
        emergency: emergency
      });
    }
  }

  // ВІДПРАВКА
  if (processedRegions.length === 0) {
    console.error("❌ No data collected.");
    process.exit(1);
  }

  const realDateToday = globalDates.today || getKyivDate(0);
  const realDateTomorrow = globalDates.tomorrow || getKyivDate(1);

  const finalOutput = {
    body: JSON.stringify({
      date_today: realDateToday,
      date_tomorrow: realDateTomorrow,
      regions: processedRegions
    }),
    timestamp: Date.now()
  };

  if (!CF_WORKER_URL || !CF_WORKER_TOKEN) {
    console.error("❌ Missing Cloudflare secrets!");
    process.exit(1);
  }

  console.log(`📤 Sending ${processedRegions.length} regions to Cloudflare...`);
  try {
    const response = await fetch(CF_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CF_WORKER_TOKEN}`
      },
      body: JSON.stringify(finalOutput)
    });
    if (!response.ok) throw new Error(await response.text());
    console.log(`✅ Success!`);
  } catch (err) {
    console.error("❌ Send Error:", err.message);
    process.exit(1);
  }
}

function updateGlobalDates(schedule, globalDates) {
  if (!globalDates.today) {
    const dates = new Set();
    Object.values(schedule).forEach(g => Object.keys(g).forEach(d => dates.add(d)));
    const sorted = Array.from(dates).sort();
    globalDates.today = sorted[0];
    globalDates.tomorrow = sorted[1];
  }
}

run();
