const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

const SPREADSHEET_ID =
  "17UoD3ftYLm0MisW88iae6cAb95VJNsfbFpPs0EXjpag";

async function main() {
  // Читаем сохранённую авторизацию
  const token = JSON.parse(
    fs.readFileSync(TOKEN_PATH, "utf8")
  );

  const auth = new google.auth.OAuth2(
    token.client_id,
    token.client_secret,
    token.redirect_uri
  );

  auth.setCredentials(token);

  // Подключаем Google Sheets
  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  // Получаем информацию о таблице
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheet = spreadsheet.data.sheets[0];
  const sheetTitle = sheet.properties.title;

  console.log("✅ Google Sheets подключён!");
  console.log("📊 Таблица:", spreadsheet.data.properties.title);
  console.log("📄 Лист:", sheetTitle);

  // Получаем данные
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetTitle}'!A1:K70`,
  });

  const rows = response.data.values || [];

  // Заголовки находятся в строке №3
  const headers = rows[2];

  console.log("\n===== КОЛОНКИ =====");
  console.log(headers);

  // Превращаем строки в объекты
  const apartments = rows
    .slice(3)
    .filter((row) => row[0] && row[0].trim() !== "")
    .map((row) => ({
      id: row[0] || "",
      type: row[1] || "",
      complex: row[2] || "",
      region: row[3] || "",
      floor: row[4] || "",
      sqm: row[5] || "",
      features: row[6] || "",
      maintenance: row[7] || "",
      finalPrice: row[8] || "",
      partnerFee: row[9] || "",
      sourceNotes: row[10] || "",
    }));

  console.log("\n🏠 Всего квартир:", apartments.length);

  console.log("\n===== ПЕРВЫЕ 5 КВАРТИР =====\n");

  apartments.slice(0, 5).forEach((apartment, index) => {
    console.log(`КВАРТИРА №${index + 1}`);
    console.log("ID:", apartment.id);
    console.log("Тип:", apartment.type);
    console.log("Комплекс:", apartment.complex);
    console.log("Регион:", apartment.region);
    console.log("Этаж:", apartment.floor);
    console.log("Площадь:", apartment.sqm);
    console.log("Особенности:", apartment.features);
    console.log("Maintenance:", apartment.maintenance);
    console.log("Цена:", apartment.finalPrice);
    console.log("Комиссия:", apartment.partnerFee);
    console.log("Источник:", apartment.sourceNotes);
    console.log("-----------------------------");
  });
}

main().catch((error) => {
  console.error("\n❌ Ошибка:");
  console.error(error.message);
});
