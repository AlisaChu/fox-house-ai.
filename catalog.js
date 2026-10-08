const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

// ID таблицы AI PRICE CATALOG
const CATALOG_ID =
  "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";

async function main() {
  // Берём сохранённую авторизацию Google
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
    auth,
  });

  // Узнаём название первого листа каталога
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: CATALOG_ID,
  });

  const sheetTitle =
    spreadsheet.data.sheets[0].properties.title;

  console.log("✅ AI PRICE CATALOG подключён");
  console.log("📄 Лист:", sheetTitle);

  // Читаем колонки A и B
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: CATALOG_ID,
    range: `'${sheetTitle}'!A:B`,
  });

  const rows = response.data.values || [];

  // Первая строка — заголовки, поэтому пропускаем её
  const catalog = rows
    .slice(1)
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      agency: row[0].trim(),
      link: row[1].trim(),
    }));

  console.log("\n🏢 Найдено прайсов:", catalog.length);
  console.log("\n===== КАТАЛОГ =====\n");

  catalog.forEach((item, index) => {
    console.log(`${index + 1}. ${item.agency}`);
    console.log(`   ${item.link}`);
  });
}

main().catch((error) => {
  console.error("\n❌ Ошибка:");
  console.error(error.message);
});
