const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

async function authorize() {
  // Если токен уже существует — используем его
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));

    const auth = new google.auth.OAuth2(
      token.client_id,
      token.client_secret,
      token.redirect_uri
    );

    auth.setCredentials(token);

    return auth;
  }

  // Первый запуск — авторизация через Google
  const auth = await authenticate({
    keyfilePath: CREDENTIALS_PATH,
    scopes: SCOPES,
  });

  // Сохраняем авторизацию
  const credentials = JSON.parse(
    fs.readFileSync(CREDENTIALS_PATH, "utf8")
  );

  const installed = credentials.installed || credentials.web;

  const token = {
    ...auth.credentials,
    client_id: installed.client_id,
    client_secret: installed.client_secret,
    redirect_uri: installed.redirect_uris[0],
  };

  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify(token, null, 2)
  );

  console.log("✅ Google авторизация сохранена!");

  return auth;
}

async function main() {
  const auth = await authorize();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const spreadsheetId =
    "17UoD3ftYLm0MisW88iae6cAb95VJNsfbFpPs0EXjpag";

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  console.log("\n✅ Google Sheets подключён!");
  console.log(
    "Название таблицы:",
    spreadsheet.data.properties.title
  );

  const sheet = spreadsheet.data.sheets[0];
  const sheetTitle = sheet.properties.title;

  console.log("Название листа:", sheetTitle);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:Z70`,
  });

  const rows = response.data.values || [];

  console.log("\n📊 Всего строк:", rows.length);

  console.log("\n===== ДАННЫЕ ТАБЛИЦЫ =====\n");

  rows.forEach((row, index) => {
    console.log(`${index + 1}:`, row);
  });

  console.log("\n===== КОНЕЦ ТАБЛИЦЫ =====");
}

main().catch((error) => {
  console.error("\n❌ Ошибка:");
  console.error(error.message);
});n
