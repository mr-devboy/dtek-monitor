import fs from "node:fs"
import path from "node:path"

import { LAST_MESSAGE_FILE } from "./constants.js"

export function capitalize(str) {
  if (typeof str !== "string") return ""
  return str[0].toUpperCase() + str.slice(1).toLowerCase()
}

export function loadLastMessage() {
  if (!fs.existsSync(LAST_MESSAGE_FILE)) return null

  const lastMessage = JSON.parse(
    fs.readFileSync(LAST_MESSAGE_FILE, "utf8").trim()
  )

  if (lastMessage?.date) {
    const messageDay = new Date(lastMessage.date * 1000).toLocaleDateString(
      "en-CA",
      { timeZone: "Europe/Kyiv" }
    )
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    })

    if (messageDay < today) {
      deleteLastMessage()
      return null
    }
  }

  return lastMessage
}

export function saveLastMessage({ date, message_id } = {}) {
  fs.mkdirSync(path.dirname(LAST_MESSAGE_FILE), { recursive: true })
  fs.writeFileSync(
    LAST_MESSAGE_FILE,
    JSON.stringify({
      message_id,
      date,
    })
  )
}

export function deleteLastMessage() {
  fs.rmdirSync(path.dirname(LAST_MESSAGE_FILE), { recursive: true })
}

export function getCurrentTime() {
  const now = new Date()

  const date = now.toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kyiv",
  })

  const time = now.toLocaleTimeString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${time} ${date}`
}
