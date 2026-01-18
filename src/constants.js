import path from "node:path"

export const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CITY, STREET, HOUSE, HA_WEBHOOK_URL } =
  process.env

export const SHUTDOWNS_PAGE = "https://www.dtek-kem.com.ua/ua/shutdowns"

export const LAST_MESSAGE_FILE = path.resolve("artifacts", `last-message.json`)
