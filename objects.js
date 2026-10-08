const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

// Mama Bulgaria — первая таблица из каталога.
// ID получим автоматически из AI PRICE CATALOG.
const CATALOG_ID =
  "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";


// -----------------------------
// Авторизация
// -----------------------------

async function getSheets() {
  const token = JSON.parse(
    fs.readFileSync(TOKEN_PATH, "utf8")
  );

  const auth = new google.auth.OAuth2(
    token.client_id,
    token.client_secret,
    token.redirect_uri
  );

  auth.setCredentials(token);

  return google.sheets({
    version: "v4",
    auth
  });
}


// -----------------------------
// Получаем ID из Google-ссылки
// -----------------------------

function getGoogleSheetId(url) {
  if (!url) return null;

  const match = url.match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  return match ? match[1] : null;
}


// -----------------------------
// Распознаём название колонки
// -----------------------------

function recognizeColumn(header) {
  const text = String(header || "")
    .toLowerCase()
    .trim();

  if (text.includes("кол-во спален")) return "type";

  if (text.includes("местоположение")) return "location";

  if (
    text.includes("комплекс") ||
    text.includes("район")
  ) {
    return "complex";
  }

  if (text.includes("этаж")) return "floor";

  if (text.includes("площадь")) return "area";

  if (text.includes("цена")) return "price";

  if (text === "вид") return "view";

  if (text.includes("такса")) return "maintenance";

  if (text.includes("мебель")) return "furniture";

  if (text.includes("комиссия")) return "commission";

  if (text.includes("примечания")) return "notes";

  if (text.includes("alo.bg")) return "listingUrl";

  if (text.includes("фото")) return "photo";

  if (
    text.includes("имя") ||
    text.includes("контакт")
  ) {
    return "contact";
  }

  return null;
}


// -----------------------------
// Чистим цену
// -----------------------------

function cleanPrice(value) {
  if (!value) return null;

  const number = String(value)
    .replace(/[^\d.,]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const price = Number(number);

  return Number.isNaN(price) ? null : price;
}


// -----------------------------
// Чистим площадь
// -----------------------------

function cleanArea(value) {
  if (!value) return null;

  const match = String(value)
    .replace(",", ".")
    .match(/\d+(\.\d+)?/);

  if (!match) return null;

  return Number(match[0]);
}


// -----------------------------
// Основная программа
// -----------------------------

async function main() {
  const sheets = await getSheets();

  // Читаем каталог
  const catalogInfo =
    await sheets.spreadsheets.get({
      spreadsheetId: CATALOG_ID
    });

  const catalogTab =
    catalogInfo.data.sheets[0].properties.title;

  const catalogResponse =
    await sheets.spreadsheets.values.get({
      spreadsheetId: CATALOG_ID,
      range: `'${catalogTab}'!A:B`
    });

  const catalogRows =
    catalogResponse.data.values || [];

  // Находим Mama Bulgaria
  const mamaRow = catalogRows.find(
    (row) =>
      String(row[0] || "")
        .toLowerCase()
        .includes("mama bulgaria")
  );

  if (!mamaRow) {
    throw new Error(
      "Mama Bulgaria не найдена в AI PRICE CATALOG"
    );
  }

  const sheetId =
    getGoogleSheetId(mamaRow[1]);

  if (!sheetId) {
    throw new Error(
      "Не удалось получить ID таблицы Mama Bulgaria"
    );
  }

  // Получаем название первого листа
  const spreadsheet =
    await sheets.spreadsheets.get({
      spreadsheetId: sheetId
    });

  const tab =
    spreadsheet.data.sheets[0].properties.title;

  // Читаем таблицу
  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tab}'!A1:Z500`
    });

  const rows = response.data.values || [];

  // Мы уже проверили:
  // у Mama Bulgaria заголовки находятся в строке 5
  const headerIndex = 4;

  const headers = rows[headerIndex];

  // Создаём карту:
  // номер колонки -> наше стандартное название
  const columnMap = {};

  headers.forEach((header, index) => {
    const field = recognizeColumn(header);

    if (field) {
      columnMap[index] = field;
    }
  });

  const apartments = [];

  // Все строки после заголовков
  for (
    let i = headerIndex + 1;
    i < rows.length;
    i++
  ) {
    const row = rows[i];

    if (!row || row.length === 0) {
      continue;
    }

    const apartment = {
      agency: "Mama Bulgaria",
      sourceRow: i + 1
    };

    // Переносим данные в стандартные поля
    Object.entries(columnMap).forEach(
      ([columnIndex, field]) => {
        apartment[field] =
          row[Number(columnIndex)] ?? null;
      }
    );

    // Нормализуем числа
    apartment.price =
      cleanPrice(apartment.price);

    apartment.area =
      cleanArea(apartment.area);

    // Не добавляем совсем пустые строки
    const hasUsefulData =
      apartment.price ||
      apartment.area ||
      apartment.location ||
      apartment.complex;

    if (hasUsefulData) {
      apartments.push(apartment);
    }
  }


  console.log(
    "\n🏠 Квартир распознано:",
    apartments.length
  );

  console.log(
    "\n========== ПЕРВЫЕ 3 ОБЪЕКТА ==========\n"
  );

  apartments
    .slice(0, 3)
    .forEach((apartment, index) => {
      console.log(
        `ОБЪЕКТ ${index + 1}`
      );

      console.log(apartment);

      console.log();
    });

  console.log(
    "======================================"
  );
}


main().catch((error) => {
  console.error("\n❌ Ошибка:");
  console.error(error.message);
});
