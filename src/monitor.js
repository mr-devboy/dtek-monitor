import { chromium } from "playwright"

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
} from "./constants.js"

import {
  capitalize,
  deleteLastMessage,
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js"

async function getInfo() {
  console.log("🌀 Getting info...")

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(SHUTDOWNS_PAGE, { waitUntil: "load" })

    const csrfTokenTag = await page.waitForSelector('meta[name="csrf-token"]', {
      state: "attached",
    })
    const csrfToken = await csrfTokenTag.getAttribute("content")

    const wrapped = await page.evaluate(
      async ({ CITY, STREET, HOUSE, csrfToken }) => {
        const formData = new URLSearchParams()
        formData.append("method", "getHomeNum")

        formData.append("data[0][name]", "city")
        formData.append("data[0][value]", CITY)

        formData.append("data[1][name]", "street")
        formData.append("data[1][value]", STREET)

        // ⚠️ Часто без дома сервер возвращает {"result":false,"text":"Error"}
        // Отправляем несколько вариантов имени поля — сервер лишнее проигнорирует.
        formData.append("data[2][name]", "house")
        formData.append("data[2][value]", HOUSE)

        formData.append("data[3][name]", "home")
        formData.append("data[3][value]", HOUSE)

        formData.append("data[4][name]", "home_num")
        formData.append("data[4][value]", HOUSE)

        formData.append("data[5][name]", "updateFact")
        formData.append("data[5][value]", new Date().toLocaleString("uk-UA"))

        const response = await fetch("/ua/ajax", {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "x-csrf-token": csrfToken,
          },
          body: formData,
        })

        const raw = await response.text()
        let json
        try {
          json = JSON.parse(raw)
        } catch {
          json = { parseError: true, raw: raw.slice(0, 500) }
        }

        return {
          status: response.status,
          ok: response.ok,
          json,
        }
      },
      { CITY, STREET, HOUSE, csrfToken }
    )

    console.log("DEBUG response status:", wrapped?.status, "ok:", wrapped?.ok)
    console.log(
      "DEBUG payload keys:",
      Object.keys(wrapped?.json || {}).slice(0, 50)
    )
    console.log("DEBUG payload:", JSON.stringify(wrapped?.json).slice(0, 2000))

    console.log("✅ Getting info finished.")
    return wrapped?.json
  } catch (error) {
    throw Error(`❌ Getting info failed: ${error.message}`)
  } finally {
    await browser.close()
  }
}

function checkIsOutage(info) {
  console.log("🌀 Checking power outage...")

  if (!info?.data) {
    console.log(
      "⚠️ No data from DTEK (address not found / format changed / temporary issue)."
    )
    return false
  }

  const { sub_type, start_date, end_date, type } = info?.data?.[HOUSE] || {}
  const isOutageDetected =
    (sub_type ?? "") !== "" ||
    (start_date ?? "") !== "" ||
    (end_date ?? "") !== "" ||
    (type ?? "") !== ""

  isOutageDetected
    ? console.log("🚨 Power outage detected!")
    : console.log("⚡️ No power outage!")

  return isOutageDetected
}

function checkIsScheduled(info) {
  console.log("🌀 Checking whether power outage scheduled...")

  if (!info?.data) {
    console.log(
      "⚠️ No data from DTEK (address not found / format changed / temporary issue)."
    )
    return false
  }

  const { sub_type } = info?.data?.[HOUSE] || {}
  const isScheduled = (sub_type || "").toLowerCase().includes("графік")

  isScheduled
    ? console.log("🗓️ Power outage scheduled!")
    : console.log("⚠️ Power outage not scheduled!")

  return isScheduled
}

function generateMessage(info) {
  console.log("🌀 Generating message...")

  const { sub_type, start_date, end_date } = info?.data?.[HOUSE] || {}
  const { updateTimestamp } = info || {}

  const reason = capitalize(sub_type || "")
  const begin = (start_date || "").split(" ")[0]
  const end = (end_date || "").split(" ")[0]

  return [
    "⚡️ <b>Зафіксовано відключення:</b>",
    `🪫 <code>${begin} — ${end}</code>`,
    "",
    `⚠️ <i>${reason}.</i>`,
    "",
    `🔄 <i>${updateTimestamp || ""}</i>`,
    `💬 <i>${getCurrentTime()}</i>`,
  ].join("\n")
}

async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN) throw Error("❌ Missing telegram bot token.")
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.")

  console.log("🌀 Sending notification...")

  const lastMessage = loadLastMessage() || {}

  try {
    const endpoint = lastMessage.message_id ? "editMessageText" : "sendMessage"

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          message_id: lastMessage.message_id ?? undefined,
        }),
      }
    )

    const data = await response.json()
    if (!data.ok) throw Error(data.description || "Telegram API error")

    saveLastMessage(data.result)
    console.log("🟢 Notification sent.")
  } catch (error) {
    console.log("🔴 Notification not sent.", error.message)
    deleteLastMessage()
  }
}

async function run() {
  // На всякий случай: тест можно включить один раз при отладке
  // await sendNotification("✅ TEST: runner + telegram работают")

  const info = await getInfo()
  const isOutage = checkIsOutage(info)
  const isScheduled = checkIsScheduled(info)

  if (isOutage && !isScheduled) {
    const message = generateMessage(info)
    await sendNotification(message)
  }
}

run().catch((error) => console.error(error.message))
