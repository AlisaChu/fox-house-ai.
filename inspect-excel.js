
"use strict";

const fs = require("fs");
const { google } = require("googleapis");
const ExcelJS = require("exceljs");

async function main() {
  const agency = process.argv.slice(2).join(" ").trim();

  if (!agency) {
    console.log("Укажи название агентства.");
    return;
  }

  const token = JSON.parse(
    fs.readFileSync("./token.json", "utf8")
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

  const drive = google.drive({
    version: "v3",
    auth
  });

  const catalogId =
    "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: catalogId
  });

  const tab = meta.data.sheets[0].properties.title;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: catalogId,
    range: `'${tab.replace(/'/g, "''")}'!A:B`
  });

  const rows = response.data.values || [];

  const source = rows.find(row =>
    String(row[0] || "")
      .toLowerCase()
      .includes(agency.toLowerCase())
  );

  if (!source) {
    console.log("Агентство не найдено:", agency);
    return;
  }

  const url = String(source[1] || "");

  const match = url.match(
    /(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/
  );

  if (!match) {
    console.log("Не удалось определить ID Excel-файла.");
    return;
  }

  console.log("Агентство:", source[0]);

  const file = await drive.files.get(
    {
      fileId: match[1],
      alt: "media"
    },
    {
      responseType: "arraybuffer"
    }
  );

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(
    Buffer.from(file.data)
  );

  for (const sheet of workbook.worksheets) {
    console.log("\nЛИСТ:", sheet.name);
    console.log("Всего строк:", sheet.rowCount);
    console.log("Всего колонок:", sheet.columnCount);

    const limit = Math.min(15, sheet.rowCount);

    for (let r = 1; r <= limit; r++) {
      const row = sheet.getRow(r);
      const cells = [];

      for (
        let c = 1;
        c <= Math.min(20, sheet.columnCount);
        c++
      ) {
        const cell = row.getCell(c);
        let value = "";

try {
  value = String(cell.text || "").trim();
} catch {
  value = "";
}

        if (value) {
          cells.push(
            `${cell.address}: ${value.slice(0, 65)}`
          );
        }
      }

      if (cells.length) {
        console.log(
          `Строка ${r}: ${cells.join(" | ")}`
        );
      }
    }
  }
}

main().catch(error => {
  console.error("ОШИБКА:", error.message);
});
