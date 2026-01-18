import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
} from "./constants.js";

import {
  capitalize,
  deleteLastMessage,
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js";

const ART_DIR = "artifacts";

async function ensureArtifactsDir() {
  await fs.mkdir(ART_DIR, { recursive: true });
}

async function writeArtifact(name, content) {
  await ensureArtifactsDir();
  const filePath = path.join(ART_DIR, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

async function getInfo() {
  console.log("🌀 Getting info...");
  console.log("DEBUG SHUTDOWNS_PAGE:", SHUTDOWNS_PAGE);
  console.log("DEBUG CITY/STREET/HOUSE:", CITY, STREET, HOUSE);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(SHUTDOWNS_PAGE, { waitUntil: "networkidle", timeout: 30000 });

    // Дождемся стабилизации страницы
    await page.waitForTimeout(2000);

    // На всякий случай сохраним HTML страницы
    const html = await page.content();
    await writeArtifact("page.html", html);

    const csrfTokenTag = await page.waitForSelector('meta[name="csrf-token"]', {
      state: "attached",
      timeout: 15000,
    });

    const csrfToken = await csrfTokenTag.getAttribute("content");
    console.log("DEBUG csrfToken length:", (csrfToken || "").length);

    const result = await page.evaluate(
      async ({ CITY, STREET, csrfToken }) => {
        const formData = new URLSearchParams();

        formData.append("method", "getHomeNum");

        formData.append("data[0][name]", "city");
        formData.append("data[0][value]", CITY);

        formData.append("data[1][name]", "street");
        formData.append("data[1][value]", STREET);

        formData.append("data[2][name]", "updateFact");
        formData.append("data[2][value]", new Date().toLocaleString("uk-UA"));

        const url = new URL("/ua/ajax", window.location.origin).toString();

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "x-csrf-token": csrfToken,
          },
          body: formData,
        });

        let text = "";
        try {
          text = await response.text();
        } catch {}

        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { _nonJson: true, text: text?.slice?.(0, 2000) || "" };
        }

        return {
          status: response.status,
          ok: response.ok,
          sent: {
            city: CITY,
            street: STREET,
          },
          payload,
        };
      },
      { CITY, STREET, csrfToken }
    );

    console.log("DEBUG response status:", result.status, "ok:", result.ok);
    console.log("DEBUG sent:", JSON.stringify(result.sent));
    console.log("DEBUG payload keys:", Object.keys(result.payload || {}));
    console.log("DEBUG payload:", JSON.stringify(result.payload).slice(0, 4000));

    await writeArtifact("last_payload.json", JSON.stringify(result, null, 2));

    // Добавляем timestamp текущего обновления если его нет в ответе API
    if (result.payload && !result.payload.updateTimestamp) {
      result.payload.updateTimestamp = getCurrentTime();
    }

    // Если сервер всё равно вернул Error — делаем скрин для понимания, что на странице
    if (result?.payload?.result === false) {
      await ensureArtifactsDir();
      await page.screenshot({ path: path.join(ART_DIR, "page.png"), fullPage: true });
      console.log("🧩 Saved artifacts: page.html, last_payload.json, page.png");
    }

    console.log("✅ Getting info finished.");
    return result.payload;
  } catch (error) {
    // фиксируем ошибку в артефакт
    await writeArtifact("last_error.txt", String(error?.stack || error?.message || error));
    throw Error(`❌ Getting info failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

function checkIsOutage(info) {
  console.log("🌀 Checking power outage...");

  // Сейчас у тебя часто приходит {result:false,text:"Error"} — это не outage, это ошибка данных.
  if (!info || info.result === false) {
    console.log("⚠️ DTEK returned error payload (result:false).");
    return false;
  }

  if (!info?.data) {
    console.log("⚠️ No data from DTEK (address not found / format changed / temporary issue).");
    return false;
  }

  // ⚠️ Тут надо понимать реальную структуру info.data.
  // Пока оставим общий детектор: если в data есть что-то похожее на start/end/type — считаем что есть отключение.
  const asText = JSON.stringify(info.data);
  const looksLikeOutage =
    asText.includes("start_date") ||
    asText.includes("end_date") ||
    asText.includes("sub_type") ||
    asText.includes("type");

  looksLikeOutage ? console.log("🚨 Power outage detected!") : console.log("⚡️ No power outage!");
  return looksLikeOutage;
}

function checkIsScheduled(info) {
  console.log("🌀 Checking whether power outage scheduled...");

  if (!info || info.result === false) return false;
  if (!info?.data) return false;

  const asText = JSON.stringify(info.data).toLowerCase();
  const isScheduled = asText.includes("графік");

  isScheduled ? console.log("🗓️ Power outage scheduled!") : console.log("⚠️ Power outage not scheduled!");
  return isScheduled;
}

function generateMessage(info) {
  console.log("🌀 Generating message...");

  const updateTimestamp = info?.updateTimestamp || "";
  const messageParts = [
    "⚡️ <b>Зафіксовано відключення:</b>",
    "",
    `🏙 <code>${CITY}</code>`,
    `📍 <code>${STREET}, ${HOUSE}</code>`,
    "",
  ];

  // Извлекаем детальную информацию об отключении для конкретного дома
  if (info?.data && HOUSE) {
    const houseData = info.data[HOUSE];
    console.log("DEBUG houseData for", HOUSE, ":", JSON.stringify(houseData));

    if (houseData) {
      // Причина отключения (тип)
      if (houseData.sub_type) {
        messageParts.push(`📋 <b>Причина:</b> ${houseData.sub_type}`);
      }

      // Дополнительное описание причины
      if (houseData.sub_type_reason && Array.isArray(houseData.sub_type_reason) && houseData.sub_type_reason.length > 0) {
        const reasons = houseData.sub_type_reason.join(", ");
        messageParts.push(`   <i>${reasons}</i>`);
      }

      // Время начала отключения
      if (houseData.start_date) {
        messageParts.push(`⏰ <b>Час початку:</b> ${houseData.start_date}`);
      }

      // Ориентировочное время восстановления
      if (houseData.end_date) {
        messageParts.push(`🔌 <b>Орієнтовний час відновлення:</b> до ${houseData.end_date}`);
      }

      messageParts.push("");
    }
  }

  // Дата обновления информации
  if (updateTimestamp) {
    messageParts.push(`🔄 <b>Дата оновлення:</b> ${updateTimestamp}`);
  }

  messageParts.push(`💬 <b>Час запиту:</b> ${getCurrentTime()}`);

  return messageParts.join("\n");
}

async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN) throw Error("❌ Missing telegram bot token.");
  if (!TELEGRAM_CHAT_ID) throw Error("❌ Missing telegram chat id.");

  console.log("🌀 Sending notification...");

  const lastMessage = loadLastMessage() || {};
  const endpoint = lastMessage.message_id ? "editMessageText" : "sendMessage";

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          message_id: lastMessage.message_id ?? undefined,
        }),
      }
    );

    const data = await response.json();
    if (!data.ok) throw Error(data.description || "Telegram API error");

    saveLastMessage(data.result);
    console.log("🟢 Notification sent.");
  } catch (error) {
    console.log("🔴 Notification not sent.", error.message);
    deleteLastMessage();
  }
}

async function run() {
  // Тест можно включать/выключать по желанию
  // await sendNotification("✅ TEST: runner + telegram работают");

  const info = await getInfo();
  const isOutage = checkIsOutage(info);
  const isScheduled = checkIsScheduled(info);

  if (isOutage && !isScheduled) {
    const message = generateMessage(info);
    await sendNotification(message);
  } else {
    console.log("ℹ️ No notification needed.");
  }
}

run().catch((error) => console.error(error.message));
