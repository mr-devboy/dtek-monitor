import path from "node:path"

export const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REGION,
  CITY,
  STREET,
  HOUSE,
  TARGET,
} = process.env

export const ADDRESS = [CITY, STREET, HOUSE].filter(Boolean).join(", ")

export const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
export const TELEGRAM_UPDATE_CHAT_TITLE =
  process.env.TELEGRAM_UPDATE_CHAT_TITLE !== "false"

export const OUTAGE_ICON = "⚠️"
export const TITLE_TEXT_START = /(?=[\p{L}\p{N}])/u

export const shutdownsPages = {
  k: "https://www.dtek-kem.com.ua/ua/shutdowns",
  kr: "https://www.dtek-krem.com.ua/ua/shutdowns",
  dn: "https://www.dtek-dnem.com.ua/ua/shutdowns",
  o: "https://www.dtek-oem.com.ua/ua/shutdowns",
  d: "https://www.dtek-dem.com.ua/ua/shutdowns",
}

export const SHUTDOWNS_PAGE =
  shutdownsPages[String(REGION).toLocaleLowerCase()] ?? shutdownsPages["kr"]

export const LAST_MESSAGE_FILE = path.resolve(
  "artifacts",
  TARGET ?? "",
  "last-message.json"
)

export const RETRIES_MAX_COUNT = 5
export const RETRIES_TIMEOUT = 5000
