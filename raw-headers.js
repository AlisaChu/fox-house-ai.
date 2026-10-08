const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

const CATALOG_ID =
  "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeRequest(fn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await sleep(1200);
      return await fn();
    } catch (error) {
      const status = error.response?.status;

      if (status === 429) {
        console.log(
          `   ⏳ Лимит Google. Жду ${attempt * 5} сек...`
        );

        await sleep(attempt * 5000);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Google API не ответил");
}

function getSheetId(url) {
  const match = String(url || "").match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  return match ? match[1] : null;
}


// Слова используются ТОЛЬКО для поиска
// наиболее вероятной строки заголовков.
const HEADER_WORDS = [
  "price",
  "цена",
  "стоимость",
  "area",
  "square",
  "sqm",
  "sq.m",
  "m2",
  "m²",
  "кв.м",
  "площад",
  "floor",
  "этаж",
  "type",
  "тип",
  "room",
  "bedroom",
  "спал",
  "комнат",
  "complex",
  "комплекс",
  "project",
  "location",
  "локац",
  "местополож",
  "city",
  "resort",
  "town",
  "такса",
  "maintenance",
  "view",
  "вид",
  "furniture",
  "мебель",
  "commission",
  "комиссия"
];

function findHeader(rows) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.forEach((row, rowIndex) => {
    let score = 0;

    row.forEach((cell) => {
      const text = String(cell || "")
        .toLowerCase()
        .trim();

      if (!text) return;

      for (const word of HEADER_WORDS) {
        if (text.includes(word)) {
          score++;
          break;
        }
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  });

  return {
    index: bestIndex,
    score: bestScore
  };
}


async function main() {
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


  // Читаем каталог
  const catalogMeta = await safeRequest(() =>
    sheets.spreadsheets.get({
      spreadsheetId: CATALOG_ID
    })
  );

  const catalogTab =
    catalogMeta.data.sheets[0].properties.title;

  const catalogData = await safeRequest(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: CATALOG_ID,
      range: `'${catalogTab}'!A:B`
    })
  );

  const catalog = (catalogData.data.values || [])
    .slice(1)
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      agency: String(row[0]).trim(),
      url: String(row[1]).trim()
    }));


  console.log("\n🔎 ЧИТАЮ ОРИГИНАЛЬНЫЕ ЗАГОЛОВКИ\n");


  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    const sheetId = getSheetId(item.url);

    console.log(
      "\n============================================"
    );

    console.log(
      `🏢 ${i + 1}/${catalog.length} — ${item.agency}`
    );


    if (!sheetId) {
      console.log("⚪ Не Google Sheets");
      continue;
    }


    try {
      const spreadsheet = await safeRequest(() =>
        sheets.spreadsheets.get({
          spreadsheetId: sheetId
        })
      );

      const tabs = spreadsheet.data.sheets.map(
        (sheet) => sheet.properties.title
      );


      for (const tab of tabs) {
        const safeTab =
          tab.replace(/'/g, "''");

        try {
          const response = await safeRequest(() =>
            sheets.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range: `'${safeTab}'!A1:AZ60`
            })
          );

          const rows =
            response.data.values || [];

          const result =
            findHeader(rows);


          if (
            result.index === -1 ||
            result.score < 2
          ) {
            console.log(
              `\n📄 Лист: ${tab}`
            );

            console.log(
              "   ⚠️ Заголовки уверенно не найдены"
            );

            continue;
          }


          const headers =
            rows[result.index] || [];


          console.log(
            `\n📄 Лист: ${tab}`
          );

          console.log(
            `📌 Строка заголовков: ${result.index + 1}`
          );

          console.log(
            `🎯 Совпадений: ${result.score}`
          );

          console.log("\nОРИГИНАЛЬНЫЕ КОЛОНКИ:");

          headers.forEach((header, index) => {
            const value =
              String(header || "").trim();

            if (value) {
              console.log(
                `   ${index + 1}. ${value}`
              );
            }
          });
        } catch (error) {
          console.log(
            `\n📄 Лист: ${tab}`
          );

          console.log(
            "   ❌ Не удалось прочитать лист"
          );
        }
      }

    } catch (error) {
      const status =
        error.response?.status;

      if (status === 400) {
        console.log(
          "🟠 Неподдерживаемый документ"
        );
      } else {
        console.log(
          "❌ Не удалось открыть:",
          error.message
        );
      }
    }
  }


  console.log(
    "\n============================================"
  );

  console.log(
    "\n✅ ГОТОВО\n"
  );
}


main().catch((error) => {
  console.error(
    "\n❌ КРИТИЧЕСКАЯ ОШИБКА:"
  );

  console.error(error.message);
});
