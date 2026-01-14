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
export const POLTAVA_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Poltavaoblenergo.json"
export const CHERKASY_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Cherkasyoblenergo.json"
export const CHERNIHIV_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Chernihivoblenergo.json"
export const KHARKIV_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Kharkivoblenerho.json"
export const KHMELNYTSKYI_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Khmelnytskoblenerho.json"
export const IVANO_FRANKIVSK_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Prykarpattiaoblenerho.json"
export const RIVNE_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Rivneoblenergo.json"
export const TERNOPIL_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Ternopiloblenerho.json"
export const ZAKARPATTIA_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Zakarpattiaoblenerho.json"
export const ZAPORIZHZHIA_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Zaporizhzhiaoblenergo.json"
export const ZHYTOMYR_JSON_URL = "https://raw.githubusercontent.com/yaroslav2901/OE_OUTAGE_DATA/main/data/Zhytomyroblenergo.json"
export const YASNO_KYIV_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages"
export const YASNO_DNIPRO_DNEM_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages"
export const YASNO_DNIPRO_CEK_URL = "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages"
