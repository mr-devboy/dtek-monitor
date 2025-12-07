import { chromium } from "playwright"
import path from "node:path"
import { 
  CITY_KYIV, STREET_KYIV, HOUSE_KYIV,
  CITY_ODESA, STREET_ODESA, HOUSE_ODESA,
  CITY_DNIPRO, STREET_DNIPRO, HOUSE_DNIPRO,
  CF_WORKER_URL, CF_WORKER_TOKEN,
  LVIV_JSON_URL,
  YASNO_KYIV_URL // <--- Додано
} from "./constants.js"

// --- КОНФІГУРАЦІЯ РЕГІОНІВ (ДТЕК - ОБЛАСТІ) ---
const DTEK_REGIONS = [
  {
    id: "kiivska-oblast",
    url: "[https://www.dtek-krem.com.ua/ua/shutdowns](https://www.dtek-krem.com.ua/ua/shutdowns)",
    city: CITY_KYIV,
    street: STREET_KYIV,
    house: HOUSE_KYIV,
    name_ua: "Київська область",
    name_ru: "Киевская область",
    name_en: "Kyiv Region"
  },
  {
    id: "odeska-oblast",
    url: "[https://www.dtek-oem.com.ua/ua/shutdowns](https://www.dtek-oem.com.ua/ua/shutdowns)",
    city: CITY_ODESA,
    street: STREET_ODESA,
    house: HOUSE_ODESA,
    name_ua: "Одеська область",
    name_ru: "Одесская область",
    name_en: "Odesa Region"
  },
  {
    id: "dnipropetrovska-oblast",
    url: "[https://www.dtek-dnem.com.ua/ua/shutdowns](https://www.dtek-dnem.com.ua/ua/shutdowns)",
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

// 1. ДТЕК (Playwright)
async function getDtekRegionInfo(browser, config) {
  if (!config.city || !config.street || !config.house) {
    console.log(`ℹ️ Skipping DTEK ${config.id}: No address configured.`);
    return null;
  }

  console.log(`🌍 Visiting DTEK ${config.url}...`);
  
  const page = await browser.newPage();
  try {
    await page.goto(config.url, { waitUntil: "load", timeout: 45000 });

    const csrfTokenTag = await page.waitForSelector('meta[name="csrf-token"]', { state: "attached" });
    const csrfToken = await csrfTokenTag.getAttribute("content");

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
    
    return info;
  } catch (error) {
    console.error(`❌ Error scraping DTEK ${config.id}:`, error.message);
    return null;
  } finally {
    await page.close();
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

// 3. YASNO КИЇВ (API JSON)
async function getYasnoData() {
  console.log(`🌍 Fetching Yasno Kyiv data...`);
  try {
    const response = await fetch(YASNO_KYIV_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error("❌ Error fetching Yasno data:", e.message);
    return null;
  }
}

// --- ТРАНСФОРМАЦІЇ ---

// Універсальна для ДТЕК / Львова
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

// Трансформація Yasno (Хвилини -> Слоти)
function transformYasnoFormat(yasnoRaw) {
  if (!yasnoRaw) return {};
  
  const scheduleMap = {};

  // Структура: { "1.1": { "today": {...}, "tomorrow": {...} } }
  for (const [groupKey, daysData] of Object.entries(yasnoRaw)) {
    // Група "1.1" -> "1.1"
    if (!scheduleMap[groupKey]) scheduleMap[groupKey] = {};

    for (const dayKey of ["today", "tomorrow"]) {
      const dayInfo = daysData[dayKey];
      if (!dayInfo || !dayInfo.date) continue;

      // "2025-12-07T00:00:00+02:00" -> "2025-12-07"
      const dateStr = dayInfo.date.substring(0, 10);
      if (!scheduleMap[groupKey][dateStr]) scheduleMap[groupKey][dateStr] = {};

      const slots = dayInfo.slots || [];
      const halfHours = new Array(48).fill(1); // За замовчуванням 1 (Світло є)

      slots.forEach(slot => {
        // type: "Definite" (точно немає, 2), "NotPlanned" (світло є, 1)
        // Можуть бути "Possible" (сіра зона), поки ставимо 2 (як відключення) для перестраховки
        let status = 1;
        if (slot.type === "Definite") status = 2;
        else if (slot.type === "Possible") status = 2;
        // else "NotPlanned" -> 1

        // Конвертуємо хвилини в індекси масиву (0..47)
        // 30 хв = 1 слот
        const startIdx = Math.floor(slot.start / 30);
        const endIdx = Math.floor(slot.end / 30);

        for (let i = startIdx; i < endIdx; i++) {
          if (i >= 0 && i < 48) {
            halfHours[i] = status;
          }
        }
      });

      // Переганяємо масив у формат об'єкта "HH:MM": status
      for (let i = 0; i < 48; i++) {
        const hour = Math.floor(i / 2);
        const minute = (i % 2) === 0 ? "00" : "30";
        const hh = String(hour).padStart(2, "0");
        scheduleMap[groupKey][dateStr][`${hh}:${minute}`] = halfHours[i];
      }
    }
  }
  return scheduleMap;
}

// 4. ГОЛОВНИЙ ЗАПУСК
async function run() {
  console.log("🚀 Starting Multi-Region Scraper (DTEK + Lviv + Yasno)...");
  
  const browser = await chromium.launch({ headless: true });
  const processedRegions = [];
  const globalDates = { today: null, tomorrow: null };

  // 1. ДТЕК (ОБЛАСТІ)
  try {
    for (const config of DTEK_REGIONS) {
      const rawInfo = await getDtekRegionInfo(browser, config);
      if (rawInfo) {
        const cleanSchedule = transformToSvitloFormat(rawInfo);
        if (Object.keys(cleanSchedule).length > 0) {
            console.log(`✅ Success DTEK: ${config.id}`);
            updateGlobalDates(cleanSchedule, globalDates);
            processedRegions.push({
                cpu: config.id,
                name_ua: config.name_ua,
                name_ru: config.name_ru,
                name_en: config.name_en,
                schedule: cleanSchedule
            });
        }
      }
    }
  } catch (err) {
    console.error("DTEK Error:", err);
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
              schedule: lvivSchedule
          });
      }
  }

  // 3. МІСТО КИЇВ (YASNO)
  const yasnoRaw = await getYasnoData();
  if (yasnoRaw) {
      const yasnoSchedule = transformYasnoFormat(yasnoRaw);
      if (Object.keys(yasnoSchedule).length > 0) {
          console.log(`✅ Success Yasno Kyiv`);
          updateGlobalDates(yasnoSchedule, globalDates);
          
          processedRegions.push({
              cpu: "kyiv", // Важливо: це ідентифікатор для м. Київ
              name_ua: "Київ",
              name_ru: "Киев",
              name_en: "Kyiv",
              schedule: yasnoSchedule
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
