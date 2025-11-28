import { chromium } from "playwright"
import path from "node:path"
import { 
  CITY_KYIV, STREET_KYIV, HOUSE_KYIV,
  CITY_ODESA, STREET_ODESA, HOUSE_ODESA,
  CITY_DNIPRO, STREET_DNIPRO, HOUSE_DNIPRO,
  CF_WORKER_URL, CF_WORKER_TOKEN 
} from "./constants.js"

// --- НАЛАШТУВАННЯ РЕГІОНІВ ---
const REGIONS_CONFIG = [
  {
    id: "kiivska-oblast",
    url: "https://www.dtek-krem.com.ua/ua/shutdowns",
    city: CITY_KYIV,
    street: STREET_KYIV,
    house: HOUSE_KYIV,
    name_ua: "Київська",
    name_ru: "Киевская",       // <--- Додано
    name_en: "Kyiv"
  },
  {
    id: "odeska-oblast",
    url: "https://www.dtek-oem.com.ua/ua/shutdowns",
    city: CITY_ODESA,
    street: STREET_ODESA,
    house: HOUSE_ODESA,
    name_ua: "Одеська",
    name_ru: "Одесская",       // <--- Додано (як в оригіналі)
    name_en: "Odesa"
  },
  {
    id: "dnipropetrovska-oblast",
    url: "https://www.dtek-dnem.com.ua/ua/shutdowns",
    city: CITY_DNIPRO,
    street: STREET_DNIPRO,
    house: HOUSE_DNIPRO,
    name_ua: "Дніпропетровська",
    name_ru: "Днепропетровская", // <--- Додано (як в оригіналі)
    name_en: "Dnipropetrovsk"    // Виправив з Dnipro на Dnipropetrovsk (як в оригіналі)
  }
];

// Допоміжна функція (залишаємо як фолбек)
function getKyivDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

// 1. ФУНКЦІЯ ОТРИМАННЯ ДАНИХ (ПАРСИНГ ОДНОГО РЕГІОНУ)
async function getRegionInfo(browser, config) {
  if (!config.city || !config.street || !config.house) {
    console.log(`ℹ️ Skipping ${config.id}: No address configured.`);
    return null;
  }

  console.log(`🌍 Visiting ${config.url} (${config.city}, ${config.street})...`);
  
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
    console.error(`❌ Error scraping ${config.id}:`, error.message);
    return null;
  } finally {
    await page.close();
  }
}

// 2. ФУНКЦІЯ ТРАНСФОРМАЦІЇ
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

// 3. ГОЛОВНИЙ ЗАПУСК
async function run() {
  console.log("🚀 Starting Multi-Region DTEK Scraper...");
  
  const browser = await chromium.launch({ headless: true });
  const processedRegions = [];
  const globalDates = { today: null, tomorrow: null };

  try {
    for (const config of REGIONS_CONFIG) {
      const rawInfo = await getRegionInfo(browser, config);
      
      if (rawInfo) {
        const cleanSchedule = transformToSvitloFormat(rawInfo);
        
        if (Object.keys(cleanSchedule).length > 0) {
            console.log(`✅ Success data for: ${config.id}`);
            
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
                name_ru: config.name_ru, // <--- ТЕПЕР ПРАВИЛЬНА НАЗВА З КОНФІГА
                name_en: config.name_en,
                schedule: cleanSchedule
            });
        } else {
            console.warn(`⚠️ Warning: Got response for ${config.id}, but schedule is empty.`);
        }
      }
    }
  } catch (err) {
    console.error("Critical error:", err);
  } finally {
    await browser.close();
  }

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
