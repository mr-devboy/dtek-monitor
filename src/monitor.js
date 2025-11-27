import { chromium } from "playwright"
import path from "node:path"
import { CITY, STREET, HOUSE, SHUTDOWNS_PAGE } from "./constants.js"

// Беремо змінні для Cloudflare з оточення
const { CF_WORKER_URL, CF_WORKER_TOKEN } = process.env;

// Допоміжна функція (залишаємо як фолбек)
function getKyivDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

// 1. ФУНКЦІЯ ОТРИМАННЯ ДАНИХ (ПАРСИНГ)
async function getInfo() {
  const browser = await chromium.launch({ headless: true })
  try {
    const browserPage = await browser.newPage()
    await browserPage.goto(SHUTDOWNS_PAGE, { waitUntil: "load" })

    const csrfTokenTag = await browserPage.waitForSelector('meta[name="csrf-token"]', { state: "attached" })
    const csrfToken = await csrfTokenTag.getAttribute("content")

    const info = await browserPage.evaluate(
      async ({ CITY, STREET, csrfToken }) => {
        const formData = new URLSearchParams()
        formData.append("method", "getHomeNum")
        formData.append("data[0][name]", "city")
        formData.append("data[0][value]", CITY)
        formData.append("data[1][name]", "street")
        formData.append("data[1][value]", STREET)
        formData.append("data[2][name]", "updateFact")
        formData.append("data[2][value]", new Date().toLocaleString("uk-UA"))

        const response = await fetch("/ua/ajax", {
          method: "POST",
          headers: { "x-requested-with": "XMLHttpRequest", "x-csrf-token": csrfToken },
          body: formData,
        })
        return await response.json()
      },
      { CITY, STREET, csrfToken }
    )
    return info
  } catch (error) {
    console.error("Scraping error:", error)
    return null
  } finally {
    await browser.close()
  }
}

// 2. ФУНКЦІЯ ТРАНСФОРМАЦІЇ ПІД ФОРМАТ SVITLO.LIVE
function transformToSvitloFormat(dtekRaw) {
  // Перевірка структури даних
  let daysData = null;
  if (dtekRaw?.data?.fact?.data) daysData = dtekRaw.data.fact.data;
  else if (dtekRaw?.fact?.data) daysData = dtekRaw.fact.data;
  else if (dtekRaw?.data) daysData = dtekRaw.data;

  if (!daysData) return {};

  const scheduleMap = {};

  // Проходимо по днях (Timestamp ключів)
  for (const [timestamp, queues] of Object.entries(daysData)) {
    
    // Конвертуємо Timestamp у дату YYYY-MM-DD
    const dateObj = new Date(parseInt(timestamp) * 1000);
    const dateStr = dateObj.toLocaleDateString("en-CA", { 
      timeZone: "Europe/Kyiv" 
    }); 

    // Проходимо по групах (GPV1.1 -> 1.1)
    for (const [gpvKey, hours] of Object.entries(queues)) {
      const groupKey = gpvKey.replace("GPV", ""); // "1.1"

      if (!scheduleMap[groupKey]) {
        scheduleMap[groupKey] = {};
      }
      if (!scheduleMap[groupKey][dateStr]) {
        scheduleMap[groupKey][dateStr] = {};
      }

      // Проходимо по годинах (1..24)
      for (let h = 1; h <= 24; h++) {
        const status = hours[h.toString()];
        
        // Форматуємо 00:00, 00:30
        const hourIndex = h - 1;
        const hourStr = hourIndex.toString().padStart(2, "0");
        const slot00 = `${hourStr}:00`;
        const slot30 = `${hourStr}:30`;

        let val00, val30;

        // ВАЖЛИВО: Формат Svitlo.live
        // 1 = Є світло (ON)
        // 2 = Немає світла (OFF)
        
        switch (status) {
          case "yes": // Світло є
            val00 = 1; val30 = 1;
            break;
          case "no": // Світла немає
            val00 = 2; val30 = 2;
            break;
          case "first": // Немає перші 30 хв (OFF, ON) -> (2, 1)
            val00 = 2; val30 = 1;
            break;
          case "second": // Немає другі 30 хв (ON, OFF) -> (1, 2)
            val00 = 1; val30 = 2;
            break;
          default: // Сіра зона або помилка - вважаємо що світло є (1)
            val00 = 1; val30 = 1;
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
  console.log("🔄 Starting DTEK update...");
  
  const rawInfo = await getInfo()
  
  if (!rawInfo) {
    console.error("❌ Failed to fetch data");
    process.exit(1);
  }

  // Трансформуємо графік
  const cleanSchedule = transformToSvitloFormat(rawInfo);

  // --- ВИПРАВЛЕННЯ ДАТ ---
  // Ми витягуємо дати прямо з отриманих даних, а не генеруємо їх
  const availableDates = new Set();
  
  // Проходимось по всіх групах, щоб знайти всі можливі дати
  Object.values(cleanSchedule).forEach(groupData => {
    Object.keys(groupData).forEach(date => availableDates.add(date));
  });

  // Сортуємо дати (2025-11-27, 2025-11-28...)
  const sortedDates = Array.from(availableDates).sort();

  // Беремо першу дату як "сьогодні", другу як "завтра" (якщо є)
  // Якщо даних немає, використовуємо фолбек getKyivDate
  const realDateToday = sortedDates[0] || getKyivDate(0);
  const realDateTomorrow = sortedDates[1] || getKyivDate(1);
  // -----------------------

  // Створюємо об'єкт регіону
  const kyivRegion = {
    "cpu": "kiivska-oblast",
    "name_ua": "Київська",
    "name_ru": "Киевская",
    "name_en": "Kyiv",
    "schedule": cleanSchedule
  };

  // Формуємо внутрішній об'єкт body
  const bodyContent = {
    "date_today": realDateToday,      // <--- ТЕПЕР ТУТ РЕАЛЬНА ДАТА З ГРАФІКУ
    "date_tomorrow": realDateTomorrow, // <--- ТЕПЕР ТУТ РЕАЛЬНА ДАТА З ГРАФІКУ
    "regions": [ kyivRegion ]
  };

  // ФІНАЛЬНА СТРУКТУРА
  const finalOutput = {
    "body": JSON.stringify(bodyContent),
    "timestamp": Date.now()
  };

  // --- ВІДПРАВКА НА CLOUDFLARE ---
  // Перевіряємо чи є змінні
  if (!CF_WORKER_URL || !CF_WORKER_TOKEN) {
      console.error("❌ Missing CF_WORKER_URL or CF_WORKER_TOKEN secrets!");
      process.exit(1);
  }

  console.log(`🚀 Sending data to Cloudflare...`);

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

      console.log(`✅ Data converted and sent to Cloudflare! Dates: ${realDateToday}, ${realDateTomorrow}`);
  } catch (err) {
      console.error("❌ Failed to send data to Cloudflare:", err.message);
      process.exit(1);
  }
}

run()
