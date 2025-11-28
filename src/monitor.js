import { chromium } from "playwright"
import path from "node:path"
import { CF_WORKER_URL, CF_WORKER_TOKEN } from "./constants.js" // Константи CITY/STREET більше не потрібні

// --- КОНФІГУРАЦІЯ РЕГІОНІВ ---
const REGIONS_CONFIG = [
  {
    cpu: "kiivska-oblast",
    url: "https://www.dtek-krem.com.ua/ua/shutdowns",
    name_ua: "Київська область",
    name_en: "Kyiv Region"
  },
  {
    cpu: "odeska-oblast",
    url: "https://www.dtek-oem.com.ua/ua/shutdowns",
    name_ua: "Одеська",
    name_en: "Odesa"
  },
  {
    cpu: "dnipropetrovska-oblast",
    url: "https://www.dtek-dnem.com.ua/ua/shutdowns",
    name_ua: "Дніпропетровська",
    name_en: "Dnipropetrovsk"
  }
];

// Допоміжна функція для фолбек-дати
function getKyivDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

// 1. УНІВЕРСАЛЬНА ФУНКЦІЯ ПАРСИНГУ (Без адреси, бере глобальний графік)
async function getRegionSchedule(page, regionConfig) {
  console.log(`🌍 Visiting: ${regionConfig.url}...`);
  try {
    await page.goto(regionConfig.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // Чекаємо поки з'явиться змінна з графіком
    try {
        await page.waitForFunction(() => typeof window.DisconSchedule !== 'undefined' && window.DisconSchedule.fact, { timeout: 15000 });
    } catch (e) {
        console.warn(`⚠️ Warning: Timeout waiting for DisconSchedule on ${regionConfig.cpu}`);
    }

    // Витягуємо дані
    const rawData = await page.evaluate(() => {
      if (window.DisconSchedule && window.DisconSchedule.fact) {
        // У деяких версіях сайту дані можуть бути глибше
        return window.DisconSchedule.fact.data || window.DisconSchedule.fact;
      }
      return null;
    });

    if (!rawData) {
      throw new Error(`DisconSchedule not found on ${regionConfig.cpu}`);
    }

    return rawData;

  } catch (error) {
    console.error(`❌ Error scraping ${regionConfig.cpu}:`, error.message);
    return null;
  }
}

// 2. ФУНКЦІЯ ТРАНСФОРМАЦІЇ (Адаптована під формат Svitlo.live)
function transformToSvitloFormat(rawData, regionConfig, globalDates) {
  if (!rawData) return null;

  const scheduleMap = {};
  
  // Сортуємо таймстемпи (дати)
  const timestamps = Object.keys(rawData).sort();

  // Оновлюємо глобальні дати, якщо це перший успішний регіон
  if (!globalDates.today && timestamps.length > 0) {
      const d1 = new Date(parseInt(timestamps[0]) * 1000);
      globalDates.today = d1.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
      
      if (timestamps[1]) {
          const d2 = new Date(parseInt(timestamps[1]) * 1000);
          globalDates.tomorrow = d2.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
      } else {
          globalDates.tomorrow = globalDates.today;
      }
  }

  for (const ts of timestamps) {
    const dateObj = new Date(parseInt(ts) * 1000);
    const dateStr = dateObj.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
    const groupsData = rawData[ts];

    for (const [gpvKey, hours] of Object.entries(groupsData)) {
      // "GPV1.1" -> "1.1"
      const groupKey = gpvKey.replace("GPV", "");

      if (!scheduleMap[groupKey]) scheduleMap[groupKey] = {};
      if (!scheduleMap[groupKey][dateStr]) scheduleMap[groupKey][dateStr] = {};

      for (let h = 1; h <= 24; h++) {
        const status = hours[h]; // Може бути числом або рядком ("yes"/"no") залежно від сайту
        
        // --- ЛОГІКА МАПІНГУ ---
        // Svitlo.live: 1 = ON, 2 = OFF
        let val00 = 1, val30 = 1;

        // ДТЕК іноді віддає "yes"/"no", іноді "1"/"0"
        const isOff = (status === "no" || status === "0" || status === 0);
        const isOn = (status === "yes" || status === "1" || status === 1);
        const isFirst = (status === "first");   // Немає перші 30 хв
        const isSecond = (status === "second"); // Немає другі 30 хв

        if (isOff) { val00 = 2; val30 = 2; }
        else if (isFirst) { val00 = 2; val30 = 1; }
        else if (isSecond) { val00 = 1; val30 = 2; }
        // else isOn або unknown -> залишаємо 1 (світло є)

        const hourIndex = h - 1;
        const hh = String(hourIndex).padStart(2, "0");
        scheduleMap[groupKey][dateStr][`${hh}:00`] = val00;
        scheduleMap[groupKey][dateStr][`${hh}:30`] = val30;
      }
    }
  }

  // Повертаємо об'єкт регіону
  return {
    cpu: regionConfig.cpu,
    name_ua: regionConfig.name_ua,
    name_ru: regionConfig.name_ua, // Фолбек
    name_en: regionConfig.name_en,
    schedule: scheduleMap
  };
}

// 3. ГОЛОВНИЙ ЗАПУСК
async function run() {
  console.log("🚀 Starting Multi-Region DTEK Scraper...");
  
  const browser = await chromium.launch({ headless: true });
  const processedRegions = [];
  
  // Об'єкт для зберігання дат (заповниться даними з сайтів)
  const globalDates = { today: null, tomorrow: null };

  try {
    const page = await browser.newPage();
    
    // Проходимо по черзі кожен регіон
    for (const regionConfig of REGIONS_CONFIG) {
      const rawData = await getRegionSchedule(page, regionConfig);
      
      if (rawData) {
        const regionJson = transformToSvitloFormat(rawData, regionConfig, globalDates);
        if (regionJson) {
          processedRegions.push(regionJson);
          console.log(`✅ Processed: ${regionConfig.cpu}`);
        }
      }
    }

  } catch (err) {
    console.error("Critical error:", err);
  } finally {
    await browser.close();
  }

  if (processedRegions.length === 0) {
    console.error("❌ No data collected. Exiting.");
    process.exit(1);
  }

  // Фолбек для дат, якщо раптом не знайшлися
  if (!globalDates.today) {
    globalDates.today = getKyivDate(0);
    globalDates.tomorrow = getKyivDate(1);
  }

  // ФОРМУВАННЯ ФІНАЛЬНОГО JSON (Масив регіонів)
  const bodyContent = {
    date_today: globalDates.today,
    date_tomorrow: globalDates.tomorrow,
    regions: processedRegions // <--- ТУТ ТЕПЕР СПИСОК (Київ, Одеса, Дніпро)
  };

  const finalOutput = {
    body: JSON.stringify(bodyContent),
    timestamp: Date.now()
  };

  // ВІДПРАВКА НА WORKER
  if (!CF_WORKER_URL || !CF_WORKER_TOKEN) {
      console.error("❌ Missing CF_WORKER_URL or CF_WORKER_TOKEN!");
      process.exit(1);
  }

  console.log(`📤 Sending consolidated data (${processedRegions.length} regions) to Cloudflare...`);

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
      console.log(`✅ Success! Data sent to Cloudflare.`);
  } catch (err) {
      console.error("❌ Failed to send data:", err.message);
      process.exit(1);
  }
}

run();
