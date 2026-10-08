const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

const CATALOG_ID =
  "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";


// ==========================================
// ПАУЗА
// ==========================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ==========================================
// БЕЗОПАСНЫЙ ЗАПРОС К GOOGLE
// ==========================================

async function safeGoogleRequest(requestFunction) {
  let attempt = 0;

  while (attempt < 5) {
    try {
      // Пауза перед каждым запросом
      await sleep(1200);

      return await requestFunction();

    } catch (error) {
      const status = error.response?.status;

      // Если слишком много запросов
      if (status === 429) {
        attempt++;

        // 5, 10, 15, 20, 25 секунд
        const waitTime = attempt * 5000;

        console.log(
          `   ⏳ Google 429. Жду ${waitTime / 1000} сек. и пробую снова...`
        );

        await sleep(waitTime);

        continue;
      }

      // Ошибки 400 и другие передаём дальше
      throw error;
    }
  }

  throw new Error(
    "Google API не ответил после 5 попыток"
  );
}


// ==========================================
// ПОЛУЧАЕМ ID GOOGLE SHEETS ИЗ ССЫЛКИ
// ==========================================

function getGoogleSheetId(url) {
  if (!url) return null;

  const match = url.match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  return match ? match[1] : null;
}


// ==========================================
// СЛОВА ДЛЯ ПОИСКА ЗАГОЛОВКОВ
// ==========================================

const HEADER_WORDS = [
  "цена",
  "price",
  "стоимость",

  "площадь",
  "sqm",
  "sq.m",
  "кв.м",
  "m2",
  "m²",

  "этаж",
  "floor",

  "спален",
  "комнат",
  "rooms",
  "bedroom",

  "тип",
  "type",

  "комплекс",
  "complex",

  "район",
  "местоположение",
  "location",

  "такса",
  "maintenance",

  "мебель",
  "furniture",

  "вид",
  "view",

  "комиссия",
  "commission",

  "номер",
  "апартамент",
  "apartment",

  "примечания",
  "notes"
];


// ==========================================
// ИЩЕМ СТРОКУ ЗАГОЛОВКОВ
// ==========================================

function findHeaderRow(rows) {
  let bestRowIndex = -1;
  let bestScore = 0;

  rows.forEach((row, index) => {
    let score = 0;

    row.forEach((cell) => {
      const text = String(cell || "")
        .toLowerCase()
        .trim();

      HEADER_WORDS.forEach((word) => {
        if (text.includes(word)) {
          score++;
        }
      });
    });

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = index;
    }
  });

  return {
    index: bestRowIndex,
    score: bestScore
  };
}


// ==========================================
// ОСНОВНАЯ ПРОГРАММА
// ==========================================

async function main() {

  // Авторизация
  const token = JSON.parse(
    fs.readFileSync(TOKEN_PATH, "utf8")
  );

  const auth = new google.auth.OAuth2(
    token.client_id,
    token.client_secret,
    token.redirect_uri
  );

  auth.setCredentials(token);

  const sheets = google.sheets({
    version: "v4",
    auth
  });


  // ========================================
  // ЧИТАЕМ AI PRICE CATALOG
  // ========================================

  const catalogSpreadsheet =
    await safeGoogleRequest(() =>
      sheets.spreadsheets.get({
        spreadsheetId: CATALOG_ID
      })
    );


  const catalogSheetTitle =
    catalogSpreadsheet.data.sheets[0]
      .properties.title;


  const catalogResponse =
    await safeGoogleRequest(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: CATALOG_ID,
        range: `'${catalogSheetTitle}'!A:B`
      })
    );


  const rows =
    catalogResponse.data.values || [];


  const catalog = rows
    .slice(1)
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      agency: row[0].trim(),
      link: row[1].trim()
    }));


  console.log(
    `\n🚀 Проверяем ${catalog.length} источников...\n`
  );


  let found = 0;
  let notFound = 0;
  let unsupported = 0;
  let errors = 0;
  let otherLinks = 0;


  // ========================================
  // ПРОХОДИМ ПО ВСЕМ АГЕНТСТВАМ
  // ========================================

  for (let i = 0; i < catalog.length; i++) {

    const item = catalog[i];

    console.log(
      `${i + 1}/${catalog.length} — ${item.agency}`
    );


    const sheetId =
      getGoogleSheetId(item.link);


    // Не Google Sheets
    if (!sheetId) {
      otherLinks++;

      console.log(
        "   ⚪ Другой тип ссылки\n"
      );

      continue;
    }


    try {

      // Получаем информацию о таблице
      const spreadsheet =
        await safeGoogleRequest(() =>
          sheets.spreadsheets.get({
            spreadsheetId: sheetId
          })
        );


      const tabs =
        spreadsheet.data.sheets.map(
          (sheet) => sheet.properties.title
        );


      let bestResult = null;


      // ====================================
      // ПРОВЕРЯЕМ ВСЕ ЛИСТЫ
      // ====================================

      for (const tab of tabs) {

        try {

          const safeTabName =
            tab.replace(/'/g, "''");


          const response =
            await safeGoogleRequest(() =>
              sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range:
                  `'${safeTabName}'!A1:Z60`
              })
            );


          const data =
            response.data.values || [];


          const result =
            findHeaderRow(data);


          if (
            !bestResult ||
            result.score > bestResult.score
          ) {

            bestResult = {
              tab: tab,
              row: result.index,
              score: result.score,
              headers:
                result.index >= 0
                  ? data[result.index]
                  : []
            };

          }

        } catch (error) {

          console.log(
            `   ⚠️ Лист "${tab}" пропущен`
          );

        }

      }


      // ====================================
      // РЕЗУЛЬТАТ
      // ====================================

      if (
        bestResult &&
        bestResult.row >= 0 &&
        bestResult.score >= 2
      ) {

        found++;

        console.log(
          "   ✅ Заголовки найдены"
        );

        console.log(
          "   📑 Лист:",
          bestResult.tab
        );

        console.log(
          "   📍 Строка:",
          bestResult.row + 1
        );

        console.log(
          "   🎯 Совпадений:",
          bestResult.score
        );

      } else {

        notFound++;

        console.log(
          "   ⚠️ Заголовки не найдены"
        );

        if (bestResult) {
          console.log(
            "   🎯 Максимум совпадений:",
            bestResult.score
          );
        }

      }


      console.log();


    } catch (error) {

      const status =
        error.response?.status;


      // Те самые Excel/неподдерживаемые документы
      if (status === 400) {

        unsupported++;

        console.log(
          "   🟠 Неподдерживаемый Google-документ (400)"
        );

      } else {

        errors++;

        console.log(
          "   ❌ Ошибка чтения"
        );

        if (status) {
          console.log(
            "   Код:",
            status
          );
        }

        console.log(
          "   Причина:",
          error.message
        );

      }


      console.log();
    }
  }


  // ========================================
  // ИТОГ
  // ========================================

  console.log(
    "\n========== ИТОГ =========="
  );

  console.log(
    "✅ Заголовки найдены:",
    found
  );

  console.log(
    "⚠️ Заголовки не найдены:",
    notFound
  );

  console.log(
    "🟠 Неподдерживаемые документы:",
    unsupported
  );

  console.log(
    "❌ Другие ошибки:",
    errors
  );

  console.log(
    "⚪ Другие ссылки:",
    otherLinks
  );

  console.log(
    "📚 Всего источников:",
    catalog.length
  );

  console.log(
    "==========================\n"
  );
}


// ==========================================
// ЗАПУСК
// ==========================================

main().catch((error) => {

  console.error(
    "\n❌ КРИТИЧЕСКАЯ ОШИБКА:"
  );

  console.error(
    error.message
  );

});
