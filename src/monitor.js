import { chromium } from "playwright"
import path from "node:path"
import { 
  CITY_KYIV, STREET_KYIV, HOUSE_KYIV,
  CITY_ODESA, STREET_ODESA, HOUSE_ODESA,
  CITY_DNIPRO, STREET_DNIPRO, HOUSE_DNIPRO,
  CF_WORKER_URL, CF_WORKER_TOKEN,
  LVIV_JSON_URL // <--- Додано імпорт
} from "./constants.js"

// --- КОНФІГУРАЦІЯ РЕГІОНІВ (ДТЕК) ---
const DTEK_REGIONS = [
  {
    id: "kiivska-oblast",
    url: "https://www.dtek-krem.com.ua/ua/shutdowns",
    city: CITY_KYIV,
    street: STREET_KYIV,
    house: HOUSE_KYIV,
    name_ua: "Київська",
    name_ru: "Киевская",
    name_en: "Kyiv"
  },
  {
    id: "odeska-oblast",
    url: "https://www.dtek-oem.com.ua/ua/shutdowns",
    city: CITY_ODESA,
    street: STREET_ODESA,
    house: HOUSE_ODESA,
    name_ua: "Одеська",
    name_ru: "Одесская",
    name_en: "Odesa"
  },
  {
    id: "dnipropetrovska-oblast",
    url: "https://www.dtek-dnem.com.ua/ua/shutdowns",
    city: CITY_DNIPRO,
    street: STREET_DNIPRO,
    house: HOUSE_DNIPRO,
    name_ua: "Дніпропетровська",
    name_ru: "Днепропетровская",
    name_en: "Dnipropetrovsk"
  }
];

// Допоміжна функція дати
function getKyivDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

// 1. ОТРИМАННЯ ДАНИХ ДТЕК (Через Playwright)
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

// 2. ОТРИМАННЯ ДАНИХ ЛЬВОВА (Через fetch JSON) - НОВА ФУНКЦІЯ
async function getLvivData() {
  console.log(`🌍 Fetching Lviv data from GitHub JSON...`);
  try {
    const response = await fetch(LVIV_JSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data;
  } catch (e) {
    console.error("❌ Error fetching Lviv data:", e.message);
    return null;
  }
}

// 3. ФУНКЦІЯ ТРАНСФОРМАЦІЇ (Універсальна)
function transformToSvitloFormat(dtekRaw) {
  let daysData = null;
  // Перевіряємо різні структури (ДТЕК vs Львів)
  if (dtekRaw?.data?.fact?.data) daysData = dtekRaw.data.fact.data;
  else if (dtekRaw?.fact?.data) daysData = dtekRaw.fact.data; // Це підходить для Львова
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
        
        // Форматуємо 00:00, 00:30
        const hourIndex = h - 1;
        const hourStr = hourIndex.toString().padStart(2, "0");
        const slot00 = `${hourStr}:00`;
        const slot30 = `${hourStr}:30`;

        let val00 = 1, val30 = 1;

        switch (status) {
          case "yes": val00 = 1; val30 = 1; break;
          case "no": val00 = 2; val30 = 2; break;
          case "first": val00 = 2; val30 = 1; break;
          case "second": val00 = 1; val30 = 2; break;
          default: val00 = 1; val30 = 1;
        }

        scheduleMap[groupKey][dateStr][slot00] = val00;
        scheduleMap[groupKey][dateStr][slot30] = val30;
      }
    }
  }
  return scheduleMap;
}

// 4. ГОЛОВНИЙ ЗАПУСК
async function run() {
  console.log("🚀 Starting Multi-Region Scraper (DTEK + Lviv)...");
  
  const browser = await chromium.launch({ headless: true });
  const processedRegions = [];
  const globalDates = { today: null, tomorrow: null };

  // --- ОБРОБКА ДТЕК ---
  try {
    for (const config of DTEK_REGIONS) {
      const rawInfo = await getDtekRegionInfo(browser, config);
      
      if (rawInfo) {
        const cleanSchedule = transformToSvitloFormat(rawInfo);
        
        if (Object.keys(cleanSchedule).length > 0) {
            console.log(`✅ Success DTEK: ${config.id}`);
            
            // Збираємо дати
            if (!globalDates.today) {
                 const dates = new Set();
                 Object.values(cleanSchedule).forEach(g => Object.keys(g).forEach(d => dates.add(d)));
                 const sorted = Array.from(dates).sort();
                 globalDates.today = sorted[0];
                 globalDates.tomorrow = sorted[1];
            }

            processedRegions.push({
                cpu: config.id,
                name_ua: config.name_ua,
                name_ru: config.name_ru,
                name_en: config.name_en,
                schedule: cleanSchedule
            });
        } else {
            console.warn(`⚠️ Warning: Got response for ${config.id}, but schedule is empty.`);
        }
      }
    }
  } catch (err) {
    console.error("Critical error in DTEK loop:", err);
  } finally {
    await browser.close();
  }

  // --- ОБРОБКА ЛЬВОВА (НОВЕ) ---
  const lvivRaw = await getLvivData();
  if (lvivRaw) {
      const lvivSchedule = transformToSvitloFormat(lvivRaw);
      if (Object.keys(lvivSchedule).length > 0) {
          console.log(`✅ Success Lviv: lvivska-oblast`);
          
          // Оновлюємо дати, якщо ДТЕК не відпрацював
          if (!globalDates.today) {
               const dates = new Set();
               Object.values(lvivSchedule).forEach(g => Object.keys(g).forEach(d => dates.add(d)));
               const sorted = Array.from(dates).sort();
               globalDates.today = sorted[0];
               globalDates.tomorrow = sorted[1];
          }

          processedRegions.push({
              cpu: "lvivska-oblast",
              name_ua: "Львівська",
              name_ru: "Львовская",
              name_en: "Lviv",
              schedule: lvivSchedule
          });
      }
  }

  // --- ПЕРЕВІРКА І ВІДПРАВКА ---
  if (processedRegions.length === 0) {
    console.error("❌ No data collected from any region. Exiting.");
    process.exit(1);
  }

  const realDateToday = globalDates.today || getKyivDate(0);
  const realDateTomorrow = globalDates.tomorrow || getKyivDate(1);

  const bodyContent = {
    date_today: realDateToday,
    date_tomorrow: realDateTomorrow,
    regions: processedRegions
  };

  const finalOutput = {
    body: JSON.stringify(bodyContent),
    timestamp: Date.now()
  };

  // ВІДПРАВКА
  if (!CF_WORKER_URL || !CF_WORKER_TOKEN) {
      console.error("❌ Missing CF_WORKER_URL or CF_WORKER_TOKEN secrets!");
      process.exit(1);
  }

  console.log(`📤 Sending data (${processedRegions.length} regions) to Cloudflare...`);

  try {
      const response = await fetch(CF_WORKER_URL, {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${CF_WORKER_TOKEN}`
          },
          body: JSON.stringify(finalOutput)
      });

      if (!response.ok) {
          throw new Error(`Worker Error: ${response.status} ${await response.text()}`);
      }
      console.log(`✅ Success! Data sent to Cloudflare. Dates: ${realDateToday}, ${realDateTomorrow}`);
  } catch (err) {
      console.error("❌ Failed to send data:", err.message);
      process.exit(1);
  }
}

run();
