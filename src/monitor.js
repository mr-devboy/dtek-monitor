import { chromium } from "playwright"

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REGION,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
  RETRIES_MAX_COUNT,
  RETRIES_TIMEOUT,
} from "./constants.js"

import {
  capitalize,
  checkIsNight,
  deleteLastMessage,
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js"

let getInfoRetries = 0
let sendNotificationRetries = 0

async function getInfo() {
  console.log("🌀 Getting info...")

  const browser = await chromium.launch({ headless: true })

  try {
    const browserPage = await browser.newPage()
    await browserPage.goto(SHUTDOWNS_PAGE, {
      waitUntil: "load",
    })

    const csrfTokenTag = await browserPage.waitForSelector(
      'meta[name="csrf-token"]',
      { state: "attached" }
    )
    const csrfToken = await csrfTokenTag.getAttribute("content")

    const info = await browserPage.evaluate(
      async ({ REGION, CITY, STREET, csrfToken }) => {
        const formData = new URLSearchParams()
        formData.append("method", "getHomeNum")

        if (REGION !== "k") {
          formData.append("data[0][name]", "city")
          formData.append("data[0][value]", CITY)
        }

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
      { REGION, CITY, STREET, csrfToken }
    )

    if (!info?.data) throw Error("power outage info missed")

    console.log("✅ Getting info finished.")
    return info
  } catch (error) {
    console.error(`❌ Getting info failed: ${error.message}.`)
  } finally {
    await browser.close()
  }

  if (getInfoRetries < RETRIES_MAX_COUNT) {
    console.log("🌀 Try getting info again...")
    await new Promise((resolve) => setTimeout(resolve, RETRIES_TIMEOUT))
    getInfoRetries++
    return await getInfo()
  }

  throw Error(`❌ Getting info failed after ${RETRIES_MAX_COUNT} retries.`)
}

function checkIsOutage(info) {
  console.log("🌀 Checking power outage...")

  const house = info.data[HOUSE]
  if (!house) throw Error(`❌ House ${HOUSE} not found.`)

  const { sub_type, start_date, end_date, type } = house
  const isOutageDetected =
    sub_type !== "" || start_date !== "" || end_date !== "" || type !== ""

  isOutageDetected
    ? console.log("🚨 Power outage detected!")
    : console.log("⚡️ No power outage!")

  return isOutageDetected
}

function checkIsScheduled(info) {
  console.log("🌀 Checking whether power outage scheduled...")

  const { sub_type } = info?.data?.[HOUSE] || {}
  const isScheduled =
    !sub_type.toLowerCase().includes("авар") &&
    !sub_type.toLowerCase().includes("екст")

  isScheduled
    ? console.log("🗓️ Power outage scheduled!")
    : console.log("⚠️ Power outage not scheduled!")

  return isScheduled
}

function generateMessage(info) {
  console.log("🌀 Generating message...")

  const { sub_type, start_date, end_date } = info?.data?.[HOUSE] || {}
  const { updateTimestamp } = info || {}

  const reason = capitalize(sub_type)
  const begin = start_date.split(" ")[0]
  const end = end_date.split(" ")[0]

  return [
    "⚡️ <b>Зафіксовано відключення:</b>",
    `🪫 <code>${begin} — ${end}</code>`,
    "",
    `⚠️ <i>${reason}.</i>`,
    "\n",
    `🔄 <i>${updateTimestamp}</i>`,
    `💬 <i>${getCurrentTime()}</i>`,
  ].join("\n")
}

async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN) throw Error("❌ Missing telegram bot token.")
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.")

  console.log("🌀 Sending notification...")

  const lastMessage = loadLastMessage() || {}
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${
        lastMessage.message_id ? "editMessageText" : "sendMessage"
      }`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          disable_notification: checkIsNight(),
          message_id: lastMessage.message_id ?? undefined,
        }),
      }
    )

    const data = await response.json()

    if (data.description?.includes("not modified")) {
      console.log("🟡 Notification not changed.")
      return
    }
    if (!data.ok) throw Error(data.description)

    saveLastMessage(data.result)

    console.log("🟢 Notification sent.")
    return
  } catch (error) {
    console.error(`❌ Sending notification failed: ${error.message}.`)
    deleteLastMessage()
  }

  if (sendNotificationRetries < RETRIES_MAX_COUNT) {
    console.log("🌀 Try sending notification again...")
    await new Promise((resolve) => setTimeout(resolve, RETRIES_TIMEOUT))
    sendNotificationRetries++
    return await sendNotification(message)
  }

  throw Error(
    `❌ Sending notification failed after ${RETRIES_MAX_COUNT} retries.`
  )
}

async function run() {
  const info = await getInfo()
  const isOutage = checkIsOutage(info)

  if (!isOutage) return

  const isScheduled = checkIsScheduled(info)
  if (isOutage && !isScheduled) {
    const message = generateMessage(info)
    await sendNotification(message)
  }
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
