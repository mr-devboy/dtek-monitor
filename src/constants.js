import path from "node:path"

export const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REGION,
  CITY,
  STREET,
  HOUSE,
} = process.env

export const shutdownsPages = {
  k: "https://www.dtek-kem.com.ua/ua/shutdowns",
  kr: "https://www.dtek-krem.com.ua/ua/shutdowns",
  dn: "https://www.dtek-dnem.com.ua/ua/shutdowns",
  o: "https://www.dtek-oem.com.ua/ua/shutdowns",
  d: "https://www.dtek-dem.com.ua/ua/shutdowns",
}

export const SHUTDOWNS_PAGE =
  shutdownsPages[String(REGION).toLocaleLowerCase()] ?? shutdownsPages["kr"]

export const LAST_MESSAGE_FILE = path.resolve("artifacts", `last-message.json`)
