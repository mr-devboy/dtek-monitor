require("dotenv").config()
const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const LAST_MESSAGE_FILE = path.resolve("artifacts", `last-message.json`)

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CITY, STREET, HOUSE } =
  process.env

async function getInfo() {
  console.log("🌀 Getting info...")

  const browser = await chromium.launch({ headless: true })
  const browserContext = await browser.newContext()
  const browserPage = await browserContext.newPage()

  try {
    await browserPage.goto("https://www.dtek-krem.com.ua/ua/shutdowns", {
      waitUntil: "networkidle",
    })

    const csrfTokenTag = await browserPage.waitForSelector(
      'meta[name="csrf-token"]',
      { state: "attached" }
    )
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
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "x-csrf-token": csrfToken,
          },
          body: formData,
        })
        return await response.json()
      },
      { CITY, STREET, csrfToken }
    )

    console.log("✅ Getting info finished.")
    return info
  } catch (error) {
    throw Error(`❌ Getting info failed: ${error.message}`)
  } finally {
    await browser.close()
  }
}

function checkOutage(info) {
  console.log("🌀 Checking power outage...")

  if (!info?.data) {
    throw Error("❌ Power outage info missed.")
  }

  const { sub_type, start_date, end_date, type } = info?.data?.[HOUSE] || {}
  const isOutageDetected =
    sub_type !== "" || start_date !== "" || end_date !== "" || type !== ""

  isOutageDetected
    ? console.log("🚨 Power outage detected!")
    : console.log("⚡️ No power outage!")

  return isOutageDetected
}

function loadLastMessage() {
  if (!fs.existsSync(LAST_MESSAGE_FILE)) return null

  const lastMessage = JSON.parse(
    fs.readFileSync(LAST_MESSAGE_FILE, "utf8").trim()
  )

  if (lastMessage?.date) {
    const messageDay = new Date(lastMessage.date * 1000)
      .toISOString()
      .slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    console.log(messageDay)
    console.log(today)

    if (messageDay < today) {
      deleteLastMessage()
      return null
    }
  }

  return lastMessage
}

function saveLastMessage(message) {
  fs.mkdirSync(path.dirname(LAST_MESSAGE_FILE), { recursive: true })
  fs.writeFileSync(LAST_MESSAGE_FILE, JSON.stringify(message))
}

function deleteLastMessage() {
  fs.rmdirSync(path.dirname(LAST_MESSAGE_FILE), { recursive: true })
}

async function sendNotification(info) {
  if (!TELEGRAM_BOT_TOKEN)
    throw Error("❌ Missing telegram bot token or chat id.")
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.")

  const { sub_type, start_date, end_date } = info?.data?.[HOUSE] || {}
  const { updateTimestamp } = info || {}
  const updateNotificationTimestamp = new Date().toLocaleString("uk-UA", {
    timeZone: "Europe/Kiev",
  })

  const text = [
    "🪫 <b>Електроенергія відсутня!</b>",
    "",
    "ℹ️ <b>Причина:</b>",
    (sub_type || "Невідома") + ".",
    "",
    "🔴 <b>Час початку:</b>",
    start_date || "Невідомий",
    "",
    "🟢 <b>Час відновлення:</b>",
    end_date || "Невідомий",
    "",
    "⏰ <b>Дата оновлення інформації:</b>",
    updateTimestamp,
    "⏰ <b>Дата оновлення повідомлення:</b>",
    updateNotificationTimestamp,
  ].join("\n")

  console.log("🌀 Sending notification...")

  const lastMessage = loadLastMessage() || {}
  console.log(lastMessage)

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${
        lastMessage.message_id ? "editMessageText" : "sendMessage"
      }`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          message_id: lastMessage.message_id ?? undefined,
        }),
      }
    )

    const data = await res.json()
    console.log("🟢 Notification sent.", data)

    saveLastMessage(data.result)
  } catch (error) {
    console.log("🔴 Notification not sent.", error.message)
    deleteLastMessage()
    console.log("🌀 Try again...")
    sendNotification(info)
  }
}

async function run() {
  const info = await getInfo()
  const isOutage = checkOutage(info)
  if (isOutage) await sendNotification(info)
}

run().catch((error) => console.error(error.message))
