import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { CITY, STREET, HOUSE, SHUTDOWNS_PAGE } from "./constants.js"

async function getInfo() {
  const browser = await chromium.launch({ headless: true })
  try {
    const browserPage = await browser.newPage()
    await browserPage.goto(SHUTDOWNS_PAGE, { waitUntil: "load" })

    const csrfTokenTag = await browserPage.waitForSelector('meta[name="csrf-token"]', { state: "attached" })
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
          headers: { "x-requested-with": "XMLHttpRequest", "x-csrf-token": csrfToken },
          body: formData,
        })
        return await response.json()
      },
      { CITY, STREET, csrfToken }
    )
    return info
  } catch (error) {
    console.error(error)
    return { error: true, message: error.message }
  } finally {
    await browser.close()
  }
}

async function run() {
  const info = await getInfo()
  
  // Зберігаємо файл у папку artifacts (або корінь), щоб GitHub його підхопив
  const outputPath = path.resolve("dtek.json")
  fs.writeFileSync(outputPath, JSON.stringify(info, null, 2))
  console.log("✅ Data saved to dtek.json")
}

run()
