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

export const SHUTDOWNS_PAGE = "https://www.dtek-krem.com.ua/ua/shutdowns" // Фолбек, не критично
