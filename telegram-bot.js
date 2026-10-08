
"use strict";

require("dotenv").config({ quiet: true });

const { Telegraf } = require("telegraf");

const {
  understandRequest,
  searchApartments
} = require("./ai-search");

// ==========================================
// НАСТРОЙКИ
// ==========================================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(
  process.env.TELEGRAM_OWNER_ID || ""
).trim();

const FIRST_PAGE_SIZE = 10;
const DEFAULT_MORE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

// Храним результаты последнего поиска
// отдельно для каждого чата и пользователя.
const searchSessions = new Map();

// Защита от одновременных запросов.
const busyUsers = new Set();

if (!TOKEN) {
  console.error("❌ Не найден TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ==========================================
// ДОСТУП
// ==========================================

function isOwner(ctx) {
  return Boolean(
    OWNER_ID &&
    String(ctx.from?.id) === OWNER_ID
  );
}

function getSessionKey(ctx) {
  return `${ctx.chat.id}:${ctx.from.id}`;
}

// ==========================================
// ФОРМАТИРОВАНИЕ
// ==========================================

function formatPrice(value) {
  const price = Number(value);

  if (!Number.isFinite(price)) {
    return "Не указана";
  }

  return (
    price.toLocaleString("ru-RU") + " €"
  );
}

function formatArea(value) {
  const area = Number(
    String(value ?? "").replace(",", ".")
  );

  if (!Number.isFinite(area) || area <= 0) {
    return "Не указана";
  }

  return `${area.toLocaleString("ru-RU")} м²`;
}

function validUrl(value) {
  const text = String(value || "").trim();

  if (!/^https?:\/\//i.test(text)) {
    return "";
  }

  try {
    const url = new URL(text);

    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function getPhotoUrl(apartment) {
  const candidates = [
    ...(Array.isArray(apartment.photoUrls)
      ? apartment.photoUrls
      : []),
    apartment.photo
  ];

  for (const candidate of candidates) {
    const url = validUrl(candidate);

    if (url) return url;
  }

  return "";
}

function getSourceUrl(apartment) {
  const original = validUrl(apartment.sourceUrl);

  if (!original) return "";

  try {
    const url = new URL(original);

    if (
      apartment.sourceGid !== null &&
      apartment.sourceGid !== undefined &&
      apartment.sourceRow !== null &&
      apartment.sourceRow !== undefined
    ) {
      const gid = String(apartment.sourceGid);
      const row = Number(apartment.sourceRow);

      if (
        /^\d+$/.test(gid) &&
        Number.isInteger(row) &&
        row > 0
      ) {
        url.hash = `gid=${gid}&range=A${row}`;
      }
    }

    return url.toString();
  } catch {
    return original;
  }
}

function formatApartment(apartment, index, total) {
  const complex =
    String(apartment.complex || "").trim() ||
    "Комплекс не указан";

  const location =
    String(apartment.location || "").trim() ||
    "Город не указан";

  const agency =
    String(apartment.agency || "").trim() ||
    "Агентство не указано";

  const photo = getPhotoUrl(apartment);
  const source = getSourceUrl(apartment);

  const lines = [
    `🏠 Квартира №${index + 1} из ${total}`,
    "",
    `🏢 ${complex}`,
    `📍 ${location}`,
    `💶 ${formatPrice(apartment.price)}`,
    `📐 ${formatArea(apartment.area)}`,
    `🏛 Агентство: ${agency}`,
    photo
      ? `📸 Фото: ${photo}`
      : "📸 Фото не указано",
    source
      ? `🔗 Прайс: ${source}`
      : ""
  ];

  return lines.filter(
    (line, index) => index < 2 || line !== ""
  ).join("\n");
}

// ==========================================
// РАСПОЗНАВАНИЕ "ПОКАЖИ ЕЩЁ"
// ==========================================

function parseMoreRequest(message) {
  const text = String(message || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

  // Примеры:
  // "покажи еще 10"
  // "еще 5"
  // "следующие 10"
  // "давай еще"
  // "продолжай"
  // "дальше"
  // "покажи оставшиеся"

  const isMore =
    /(?:еще|следующ|дальше|продолжай|продолжить|оставш|остальн)/u.test(text);

  if (!isMore) return null;

  // Не путаем новую подборку с продолжением:
  // "найди еще студии до 60000" — новый поиск.
  if (
    /(?:найди|подбери|поищи|ищи|поиск)\s+/u.test(text)
  ) {
    return null;
  }

  // Не считаем поисковым продолжением запросы
  // с новой ценой, городом или площадью.
  if (
    /(?:евро|€|eur|м²|м2|кв\.?\s*м|дороже|дешевле)/u.test(text)
  ) {
    return null;
  }

  const numberMatch = text.match(/\b(\d{1,3})\b/u);

  let count = numberMatch
    ? Number(numberMatch[1])
    : DEFAULT_MORE_SIZE;

  if (/все|всех|оставшиеся|остальные/u.test(text)) {
    count = MAX_PAGE_SIZE;
  }

  if (
    !Number.isInteger(count) ||
    count <= 0
  ) {
    count = DEFAULT_MORE_SIZE;
  }

  return Math.min(count, MAX_PAGE_SIZE);
}

// ==========================================
// ОТПРАВКА ПОДБОРКИ
// ==========================================

async function sendNextApartments(ctx, count) {
  const key = getSessionKey(ctx);
  const session = searchSessions.get(key);

  if (!session) {
    await ctx.reply(
      "🔎 Сначала найди квартиры.\n\n" +
      "Например:\n" +
      "Студии на Солнечном Берегу от 45000 до 65000 евро"
    );
    return;
  }

  const total = session.apartments.length;
  const start = session.nextIndex;

  if (start >= total) {
    await ctx.reply(
      `✅ Все ${total} объектов уже показаны.\n\n` +
      "Напиши новый запрос, чтобы найти другие квартиры."
    );
    return;
  }

  const end = Math.min(
    start + count,
    total
  );

  await ctx.reply(
    `📋 Показываю квартиры ${start + 1}–${end} из ${total}`
  );

  // Продвигаем указатель только после
  // успешной отправки каждой квартиры.
  for (let index = start; index < end; index++) {
    const apartment = session.apartments[index];

    await ctx.reply(
      formatApartment(apartment, index, total),
      {
        link_preview_options: {
          is_disabled: true
        }
      }
    );

    session.nextIndex = index + 1;
  }

  const remaining = total - session.nextIndex;

  if (remaining > 0) {
    await ctx.reply(
      `✅ Показано ${session.nextIndex} из ${total}.\n` +
      `📌 Осталось: ${remaining}.\n\n` +
      "Напиши:\n" +
      "«Покажи ещё 10»\n" +
      "или «Покажи ещё 5»"
    );
  } else {
    await ctx.reply(
      `🎉 Все ${total} квартир показаны!\n\n` +
      "Можешь начать новый поиск."
    );
  }
}

// ==========================================
// КОМАНДА /ID
// ==========================================

bot.command("id", async (ctx) => {
  if (
    OWNER_ID &&
    !isOwner(ctx)
  ) {
    return;
  }

  await ctx.reply(
    `Твой Telegram ID: ${ctx.from.id}`
  );
});

// ==========================================
// КОМАНДА /START
// ==========================================

bot.start(async (ctx) => {
  if (!OWNER_ID) {
    await ctx.reply(
      "🔒 Сначала отправь /id для настройки доступа."
    );
    return;
  }

  if (!isOwner(ctx)) return;

  await ctx.reply(
    "🏠 Fox House Property AI\n\n" +
    "Я ищу недвижимость в твоих прайсах.\n\n" +
    "Примеры запросов:\n\n" +
    "🔎 Студии в Солнечном Берегу до 65000 евро\n\n" +
    "🔎 Двухкомнатные в Святом Власе от 70000 до 100000 евро\n\n" +
    "🔎 Квартиры дороже 120000 евро\n\n" +
    "После выдачи напиши:\n" +
    "➡️ Покажи ещё 10\n" +
    "➡️ Покажи ещё 5\n" +
    "➡️ Продолжай\n\n" +
    "Я запоминаю результаты последнего поиска."
  );
});

// ==========================================
// КОМАНДА /MORE
// ==========================================

bot.command("more", async (ctx) => {
  if (!isOwner(ctx)) return;

  const key = getSessionKey(ctx);

  if (busyUsers.has(key)) {
    await ctx.reply(
      "⏳ Подожди, я ещё отправляю предыдущую подборку."
    );
    return;
  }

  busyUsers.add(key);

  try {
    await sendNextApartments(
      ctx,
      DEFAULT_MORE_SIZE
    );
  } catch (error) {
    console.error("Ошибка /more:", error);

    await ctx.reply(
      "❌ Не удалось отправить все сообщения. " +
      "Напиши «Покажи ещё», чтобы продолжить."
    );
  } finally {
    busyUsers.delete(key);
  }
});

// ==========================================
// КОМАНДА /RESET
// ==========================================

bot.command("reset", async (ctx) => {
  if (!isOwner(ctx)) return;

  const key = getSessionKey(ctx);

  if (busyUsers.has(key)) {
    await ctx.reply(
      "⏳ Дождись завершения текущей отправки."
    );
    return;
  }

  searchSessions.delete(key);

  await ctx.reply(
    "🗑 Предыдущая подборка очищена.\n" +
    "Можешь начать новый поиск."
  );
});

// ==========================================
// ОБРАБОТКА СООБЩЕНИЙ
// ==========================================

bot.on("text", async (ctx) => {
  if (!isOwner(ctx)) return;

  const message = String(
    ctx.message.text || ""
  ).trim();

  if (!message || message.startsWith("/")) {
    return;
  }

  const key = getSessionKey(ctx);

  if (busyUsers.has(key)) {
    await ctx.reply(
      "⏳ Подожди, я ещё обрабатываю предыдущий запрос."
    );
    return;
  }

  busyUsers.add(key);

  try {
    // --------------------------------------
    // 1. ПРОВЕРЯЕМ: ЭТО ПРОДОЛЖЕНИЕ?
    // --------------------------------------

    const moreCount = parseMoreRequest(message);

    if (moreCount !== null) {
      await sendNextApartments(ctx, moreCount);
      return;
    }

    // --------------------------------------
    // 2. НОВЫЙ ПОИСК
    // --------------------------------------

    await ctx.reply("🔎 Ищу квартиры...");

    const filters = await understandRequest(message);

    const hasFilters = [
      filters.city,
      filters.minPrice,
      filters.maxPrice,
      filters.minArea,
      filters.maxArea,
      filters.type,
      filters.complex,
      filters.minFloor,
      filters.maxFloor
    ].some(value => value !== null && value !== undefined);

    const hasCategory =
      filters.category &&
      filters.category !== "apartment";

    if (!hasFilters && !hasCategory) {
      await ctx.reply(
        "Напиши параметры поиска квартиры.\n\n" +
        "Например:\n" +
        "Студии в Равде до 65000 евро"
      );
      return;
    }

    const apartments = searchApartments(filters);

    if (!Array.isArray(apartments) || apartments.length === 0) {
      searchSessions.delete(key);

      await ctx.reply(
        "🏠 По этому запросу объекты не найдены.\n\n" +
        "Попробуй изменить цену, город или площадь."
      );
      return;
    }

    // --------------------------------------
    // 3. ЗАПОМИНАЕМ ВСЕ РЕЗУЛЬТАТЫ
    // --------------------------------------

    searchSessions.set(key, {
      apartments: [...apartments],
      nextIndex: 0,
      filters,
      originalRequest: message,
      createdAt: Date.now()
    });

    await ctx.reply(
      `🏠 Найдено квартир: ${apartments.length}\n\n` +
      `Сначала покажу до ${FIRST_PAGE_SIZE} объектов.\n` +
      "Остальные сможешь посмотреть командой «Покажи ещё 10»."
    );

    // --------------------------------------
    // 4. ПОКАЗЫВАЕМ ПЕРВЫЕ 10
    // --------------------------------------

    await sendNextApartments(
      ctx,
      FIRST_PAGE_SIZE
    );

    await ctx.reply(
      "ℹ️ Наличие и актуальную цену уточняй у агентства."
    );

  } catch (error) {
    console.error("Ошибка Telegram-бота:", error);

    try {
      await ctx.reply(
        "❌ Возникла ошибка.\n\n" +
        "Если часть квартир уже показана, " +
        "напиши «Покажи ещё 10».\n\n" +
        "Если поиск не начался, проверь Ollama."
      );
    } catch (replyError) {
      console.error(
        "Не удалось отправить сообщение об ошибке:",
        replyError
      );
    }
  } finally {
    busyUsers.delete(key);
  }
});

// ==========================================
// ОБРАБОТКА ОШИБОК
// ==========================================

bot.catch((error) => {
  console.error(
    "Ошибка Telegraf:",
    error
  );
});

// ==========================================
// ЗАПУСК
// ==========================================

bot.launch()
  .then(() => {
    console.log(
      "🤖 Fox House Property AI запущен"
    );

    console.log(
      "📋 Постраничная выдача включена"
    );

    console.log(
      "🔒 Приватный доступ настроен"
    );
  })
  .catch((error) => {
    console.error(
      "❌ Ошибка запуска:",
      error.message
    );

    process.exit(1);
  });

// ==========================================
// КОРРЕКТНОЕ ЗАВЕРШЕНИЕ
// ==========================================

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});
