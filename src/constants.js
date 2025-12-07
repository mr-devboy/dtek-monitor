import path from "node:path"

export const { 
  // Київ (оновлено)
  CITY_KYIV, STREET_KYIV, HOUSE_KYIV,
  
  // Одеса
  CITY_ODESA, STREET_ODESA, HOUSE_ODESA,
  
  // Дніпро
  CITY_DNIPRO, STREET_DNIPRO, HOUSE_DNIPRO,

  // Cloudflare
  CF_WORKER_URL, CF_WORKER_TOKEN 
} = process.env

export const SHUTDOWNS_PAGE = "https://www.dtek-krem.com.ua/ua/shutdowns"
export const LVIV_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Lvivoblenerho.json"
export const YASNO_KYIV_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages"
export const YASNO_DNIPRO_DNEM_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages"
export const YASNO_DNIPRO_CEK_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages"
