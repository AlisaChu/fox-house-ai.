
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { google } = require("googleapis");

const ROOT = __dirname;
const CREDENTIALS_PATH = path.join(ROOT, "credentials.json");
const TOKEN_PATH = path.join(ROOT, "token.json");
const BACKUP_PATH = path.join(ROOT, "token-before-drive.json");

const credentials = JSON.parse(
  fs.readFileSync(CREDENTIALS_PATH, "utf8")
).installed;

if (!credentials) {
  throw new Error("Нужен OAuth-клиент типа Desktop.");
}

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly"
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      throw new Error("Google: " + error);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new Error("Google не вернул код авторизации.");
    }

    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        "Google не выдал refresh_token. Старый токен сохранён."
      );
    }

    // Сохраняем старую авторизацию перед заменой.
    if (fs.existsSync(TOKEN_PATH)) {
      fs.copyFileSync(TOKEN_PATH, BACKUP_PATH);
    }

    const newToken = {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uri: redirectUri,
      ...tokens
    };

    const temporaryPath = TOKEN_PATH + ".tmp";

    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(newToken, null, 2),
      { encoding: "utf8", mode: 0o600 }
    );

    fs.renameSync(temporaryPath, TOKEN_PATH);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(
      "<h2>Fox House AI: Google Drive подключён!</h2>" +
      "<p>Можете закрыть эту вкладку.</p>"
    );

    console.log("\n✅ Авторизация завершена!");
    console.log("✅ Разрешения Google Sheets и Drive получены.");
    console.log("✅ Новый token.json сохранён.");
    console.log("✅ Старый токен сохранён в резервной копии.");

  } catch (error) {
    console.error("\n❌ Ошибка:", error.message);

    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Ошибка авторизации. Посмотрите терминал.");
  } finally {
    server.close();
  }
});

let auth;
let redirectUri;

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;

  redirectUri = `http://127.0.0.1:${port}/callback`;

  auth = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri
  );

  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  console.log("\n🔐 АВТОРИЗАЦИЯ FOX HOUSE AI");
  console.log("\n1. Откройте ссылку в браузере:");
  console.log("\n" + authUrl);
  console.log("\n2. Войдите в Google-аккаунт с доступом к прайсам.");
  console.log("3. Разрешите чтение Google Sheets и Google Drive.");
  console.log("4. Дождитесь подтверждения в браузере.");
});

server.on("error", (error) => {
  console.error("❌ Не удалось запустить авторизацию:", error.message);
});
