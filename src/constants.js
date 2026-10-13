import path from "node:path"

export const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REGION,
  CITY,
  STREET,
  HOUSE,
  CHECK_ADDRESS,
  CHECK_GRID_STATUS,
} = process.env

export const SHOULD_CHECK_GRID_STATUS =
  String(CHECK_GRID_STATUS).trim().toLowerCase() !== "false"

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
export const SHOULD_CHECK_ADDRESS = CHECK_ADDRESS !== "false"

// Pause before the second popup check that confirms a cancellation
export const CANCEL_RECHECK_DELAY = 30 * 1000

export const GRID_STATUS_URL =
  "https://raw.githubusercontent.com/lasercat12/ua-power-status/main/data/regions.json"
export const gridStatusRegions = {
  k: "kyiv",
  kr: "kyiv-oblast",
  dn: "dnipropetrovsk",
  o: "odesa",
  d: "donetsk",
}
export const GRID_STATUS_REGION =
  gridStatusRegions[String(REGION).toLocaleLowerCase()] ?? gridStatusRegions.kr

export const RETRIES_MAX_COUNT = 5
export const RETRIES_TIMEOUT = 5000
