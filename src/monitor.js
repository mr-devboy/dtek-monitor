import { chromium } from "playwright"

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REGION,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
  SHOULD_CHECK_ADDRESS,
  RETRIES_MAX_COUNT,
  RETRIES_TIMEOUT,
  CANCEL_RECHECK_DELAY,
  GRID_STATUS_URL,
  GRID_STATUS_REGION,
  SHOULD_CHECK_GRID_STATUS,
} from "./constants.js"

import {
  capitalize,
  checkIsNight,
  deleteLastMessage,
  getCurrentTime,
  isEmergencyMessage,
  isEmergencyNotice,
  isStabilizationNotice,
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

    const readRegionalNotice = () =>
      browserPage
        .locator(".m-attention__container.modal__container--firstPopup")
        .evaluateAll((modals) =>
          modals
            .map((modal) => {
              const title = modal.querySelector(".modal__title")?.textContent
              const textNode = modal
                .querySelector(".m-attention__text")
                ?.cloneNode(true)
              textNode
                ?.querySelectorAll("br")
                .forEach((br) => br.replaceWith("\n"))
              const text = textNode?.textContent
              return [title, text]
                .filter(Boolean)
                .join("\n\n")
                .replace(/[ \t]+/g, " ")
                .replace(/\s*\n\s*/g, "\n")
                .trim()
            })
            .find(Boolean)
        )

    // The popup may render slightly after the load event
    await browserPage
      .waitForSelector(".m-attention__container.modal__container--firstPopup", {
        state: "attached",
        timeout: 5000,
      })
      .catch(() => {})

    let regionalNotice
    for (let attempt = 1; ; attempt++) {
      try {
        await browserPage.waitForLoadState("load")
        regionalNotice = await readRegionalNotice()
        break
      } catch (error) {
        // The site may reload itself while the popup is being read
        const isNavigation = error.message.includes("Execution context")
        if (!isNavigation || attempt >= 3) throw error
        console.log("🔁 Page navigated, reading popup again...")
      }
    }

    const emergencyNotice = isEmergencyNotice(regionalNotice)
      ? regionalNotice
      : null

    if (emergencyNotice) {
      console.log("🚨 Regional outage notice detected!")
      return { emergencyNotice, regionalNotice }
    } else if (regionalNotice) {
      console.log("ℹ️ Regional stabilization notice detected.")
    }

    // Without the token the page is not the real DTEK page (Cloudflare,
    // maintenance, half-rendered), so "no popup" must not be trusted.
    const csrfTokenTag = await browserPage.waitForSelector(
      'meta[name="csrf-token"]',
      { state: "attached", timeout: 20000 }
    )
    const csrfToken = await csrfTokenTag.getAttribute("content")

    if (!SHOULD_CHECK_ADDRESS) {
      console.log("✅ Emergency popup check finished.")
      return { emergencyNotice, regionalNotice }
    }

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

    if (!info?.data) {
      throw Error(
        `power outage info missed (${JSON.stringify(info)?.slice(0, 200)})`
      )
    }

    console.log("✅ Getting info finished.")
    return { emergencyNotice, regionalNotice, info }
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
  const update = updateTimestamp?.split(" ").reverse().join(" ")

  const reason = capitalize(sub_type)
  const begin = start_date.split(" ")[0]
  const end = end_date.split(" ")[0]

  const outageText = [
    `🪫 <code>${begin} — ${end}</code>`,
    "",
    `⚠️ <i>${reason}.</i>`,
  ].join("\n")

  const text = [
    "⚡️ <b>Зафіксовано відключення:</b>",
    outageText,
    "",
    `📢 <i>${update}</i>`,
    `🤖 <i>${getCurrentTime()}</i>`,
  ].join("\n")

  return { text, outageText, messageType: "outage" }
}

async function getGridStatusLine() {
  if (!SHOULD_CHECK_GRID_STATUS) return null

  try {
    const response = await fetch(GRID_STATUS_URL, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    const region = data?.regions?.find((r) => r.slug === GRID_STATUS_REGION)
    if (!region) return null

    const since = region.since
      ? ` (з ${new Date(region.since).toLocaleString("uk-UA", {
          timeZone: "Europe/Kyiv",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })})`
      : ""

    return `${region.emoji} <b>${region.name_uk}:</b> ${region.title_uk}${since}`
  } catch (error) {
    // The grid status is only a supplement, never block the notification
    console.error(`⚠️ Grid status unavailable: ${error.message}.`)
    return null
  }
}

function generateEmergencyMessage(emergencyNotice, gridStatusLine) {
  console.log("🌀 Generating emergency outage message...")

  const escapedNotice = emergencyNotice
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

  const outageText = [
    `🚨 <b>Екстрені / аварійні відключення:</b>\n\n${escapedNotice}`,
    gridStatusLine,
  ]
    .filter(Boolean)
    .join("\n\n")
  const text = [outageText, "", `🤖 <i>${getCurrentTime()}</i>`].join("\n")

  return { text, outageText, messageType: "emergency" }
}

function generateEmergencyCancellationMessage(regionalNotice, gridStatusLine) {
  console.log("🌀 Generating emergency outage cancellation message...")

  const stabilizationStatus = isStabilizationNotice(regionalNotice)
    ? "<b>Діють стабілізаційні відключення.</b>"
    : "<b>Стабілізаційних відключень наразі немає.</b>"
  const outageText = [
    "✅ <b>Екстрені / аварійні відключення скасовано.</b>",
    stabilizationStatus,
    gridStatusLine,
  ]
    .filter(Boolean)
    .join("\n\n")
  const text = [outageText, "", `🤖 <i>${getCurrentTime()}</i>`].join("\n")

  return { text, outageText, messageType: "emergency-canceled" }
}

async function sendNotification({ text, outageText, messageType }) {
  if (!TELEGRAM_BOT_TOKEN) throw Error("❌ Missing telegram bot token.")
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.")

  console.log("🌀 Sending notification...")

  const lastMessage = loadLastMessage() || {}
  const isThreadClosed = lastMessage.messageType === "emergency-canceled"
  const isOutageChanged = lastMessage.outageText !== outageText
  const hasMessageId = Boolean(lastMessage.message_id)
  const hasOpenMessage = hasMessageId && !isThreadClosed
  // A closed thread's cancellation message keeps getting its status refreshed
  const isCancellationUpdate =
    isThreadClosed && hasMessageId && messageType === "emergency-canceled"

  if (isCancellationUpdate && !isOutageChanged) {
    console.log("🟡 Notification not changed.")
    return
  }

  // An open emergency message is updated in place when the notice changes
  const isEmergencyUpdate =
    messageType === "emergency" && isEmergencyMessage(lastMessage)
  const isEdit =
    isCancellationUpdate ||
    (hasOpenMessage && (!isOutageChanged || isEmergencyUpdate))
  const isReply = hasOpenMessage && !isEdit

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${
        isEdit ? "editMessageText" : "sendMessage"
      }`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_notification: checkIsNight(),
          message_id: isEdit ? lastMessage.message_id : undefined,
          reply_parameters: isReply
            ? {
                message_id: lastMessage.message_id,
                allow_sending_without_reply: true,
              }
            : undefined,
        }),
      }
    )

    const data = await response.json()

    if (data.description?.includes("not modified")) {
      console.log("🟡 Notification not changed.")
      return
    }
    if (!data.ok) throw Error(data.description)

    saveLastMessage({ ...data.result, outageText, messageType })

    console.log("🟢 Notification sent.")
    return
  } catch (error) {
    console.error(`❌ Sending notification failed: ${error.message}.`)
    if (isEdit && error.message.includes("message to edit not found")) {
      deleteLastMessage()
    }
  }

  if (sendNotificationRetries < RETRIES_MAX_COUNT) {
    console.log("🌀 Try sending notification again...")
    await new Promise((resolve) => setTimeout(resolve, RETRIES_TIMEOUT))
    sendNotificationRetries++
    return await sendNotification({ text, outageText, messageType })
  }

  throw Error(
    `❌ Sending notification failed after ${RETRIES_MAX_COUNT} retries.`
  )
}

async function run() {
  let result = await getInfo()

  if (!result.emergencyNotice && isEmergencyMessage(loadLastMessage())) {
    // Re-check after a pause so a single glitchy page load can't cancel
    console.log(
      `🟡 No emergency popup, re-checking in ${CANCEL_RECHECK_DELAY / 1000}s...`
    )
    await new Promise((resolve) => setTimeout(resolve, CANCEL_RECHECK_DELAY))
    result = await getInfo()
  }

  const { emergencyNotice, regionalNotice, info } = result

  if (emergencyNotice) {
    const message = generateEmergencyMessage(
      emergencyNotice,
      await getGridStatusLine()
    )
    await sendNotification(message)
    return
  }

  const lastMessage = loadLastMessage()

  if (isEmergencyMessage(lastMessage)) {
    const message = generateEmergencyCancellationMessage(
      regionalNotice,
      await getGridStatusLine()
    )
    await sendNotification(message)
    return
  }

  if (lastMessage?.messageType === "emergency-canceled") {
    // Keep the closed thread's status current until a new emergency starts
    const gridStatusLine = await getGridStatusLine()
    if (gridStatusLine) {
      await sendNotification(
        generateEmergencyCancellationMessage(regionalNotice, gridStatusLine)
      )
    }
  }

  if (!info) return

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
