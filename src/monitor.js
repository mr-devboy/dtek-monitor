import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { SHUTDOWNS_PAGE } from "./constants.js" // CITY/STREET/HOUSE більше не потрібні для цього методу

// Функція для форматування дати з Unix timestamp (секунди) у YYYY-MM-DD
function formatDateFromTimestamp(timestamp) {
  // Множимо на 1000, бо JS працює з мілісекундами
  const d = new Date(timestamp * 1000)
  // Використовуємо локаль uk-UA з часовим поясом Києва, щоб уникнути зміщення
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" }) // повертає YYYY-MM-DD
}

async function getFullSchedule() {
  console.log("⏳ Launching browser...")
  const browser = await chromium.launch({ headless: true })
  
  try {
    const page = await browser.newPage()
    console.log("🌍 Opening DTEK page...")
    await page.goto(SHUTDOWNS_PAGE, { waitUntil: "networkidle" }) // чекаємо завершення запитів

    // Витягуємо глобальну змінну DisconSchedule, яка містить всі графіки
    const rawSchedule = await page.evaluate(() => {
      // Перевіряємо різні варіанти, де ДТЕК може ховати дані
      if (window.DisconSchedule && window.DisconSchedule.fact) {
        return window.DisconSchedule.fact
      }
      return null
    })

    if (!rawSchedule || !rawSchedule.data) {
      throw new Error("❌ DisconSchedule not found on page")
    }

    console.log("✅ Raw schedule found")
    return rawSchedule.data

  } catch (error) {
    console.error("❌ Error getting schedule:", error.message)
    return null
  } finally {
    await browser.close()
  }
}

function transformData(rawData) {
  const finalSchedule = {} // Тут буде структура {"1.1": {...}, "1.2": {...}}
  const availableDates = []

  // Сортуємо таймстемпи (дати), щоб йшли по порядку
  const timestamps = Object.keys(rawData).sort()

  // 1. Проходимося по кожній даті (Unix timestamp)
  for (const ts of timestamps) {
    const dateStr = formatDateFromTimestamp(ts) // "2025-11-27"
    availableDates.push(dateStr)
    const groupsData = rawData[ts] // Об'єкт з групами GPV1.1 ...

    // 2. Проходимося по кожній групі (GPV1.1, GPV1.2...)
    for (const [groupKey, hoursData] of Object.entries(groupsData)) {
      // Перетворюємо "GPV1.1" -> "1.1"
      const normalizedGroup = groupKey.replace("GPV", "")
      
      if (!finalSchedule[normalizedGroup]) {
        finalSchedule[normalizedGroup] = {}
      }

      // Створюємо об'єкт для конкретної дати
      finalSchedule[normalizedGroup][dateStr] = {}

      // 3. Заповнюємо години. ДТЕК дає 1..24. Нам треба "00:00".."23:30"
      for (let h = 1; h <= 24; h++) {
        const hourVal = hoursData[h] // "yes", "no", "second", "first"
        
        // МАПІНГ СТАТУСІВ:
        // "yes" (є світло) -> 1
        // "no" (немає) -> 2 (у вашому JSON це було 2)
        // "second" (сіра зона/немає) -> 2
        // "first" (сіра зона/є) -> 2 (для перестраховки ставимо як відключення, або змініть на 1)
        
        let status = 1
        if (hourVal === "yes") status = 1
        else status = 2 // "no", "second", "first" вважаємо за 2 (відключення/можливе відключення)

        // Формуємо ключі часу
        // h=1 це 00:00 - 01:00. Тобто слоти "00:00" і "00:30"
        const hourIndex = h - 1 // 0..23
        const hh = String(hourIndex).padStart(2, "0")
        
        finalSchedule[normalizedGroup][dateStr][`${hh}:00`] = status
        finalSchedule[normalizedGroup][dateStr][`${hh}:30`] = status
      }
    }
  }

  // Формуємо фінальний "дивний" JSON
  // Беремо першу і другу дату з знайдених
  const dateToday = availableDates[0]
  const dateTomorrow = availableDates[1] || availableDates[0] // Фоллбек якщо є тільки одна дата

  const output = {
    body: JSON.stringify({
      date_today: dateToday,
      date_tomorrow: dateTomorrow,
      regions: [
        {
          cpu: "kiivska-oblast", // Або "kiev-city"
          name_ua: "Київська",
          name_ru: "Киевская",
          name_en: "Kyiv",
          schedule: finalSchedule
        }
      ]
    }),
    timestamp: Date.now()
  }

  return output
}

async function run() {
  const rawData = await getFullSchedule()
  if (rawData) {
    const formattedJson = transformData(rawData)
    
    const outputPath = path.resolve("dtek.json")
    fs.writeFileSync(outputPath, JSON.stringify(formattedJson, null, 2))
    console.log("💾 Data saved to dtek.json")
  }
}

run()
