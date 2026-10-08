
const { google } = require("googleapis");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const FILE_ID = "12x3CSiw2B_Zm4vyQweI_PsKrc35dvhP1";

async function main() {
  const token = JSON.parse(
    fs.readFileSync(path.join(__dirname, "token.json"), "utf8")
  );

  const auth = new google.auth.OAuth2(
    token.client_id,
    token.client_secret,
    token.redirect_uri
  );

  auth.setCredentials(token);

  const drive = google.drive({
    version: "v3",
    auth
  });

  console.log("Подключаемся к Google Drive...");

  const response = await drive.files.get(
    {
      fileId: FILE_ID,
      alt: "media"
    },
    {
      responseType: "arraybuffer"
    }
  );

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(Buffer.from(response.data));

  console.log("\nExcel-файл успешно прочитан!");

  workbook.eachSheet((sheet) => {
    console.log("\nЛист:", sheet.name);
    console.log("Всего строк:", sheet.rowCount);
    console.log("Всего столбцов:", sheet.columnCount);

    console.log("\nПервые 5 строк:");

    const limit = Math.min(sheet.rowCount, 5);

    for (let i = 1; i <= limit; i++) {
      const row = sheet.getRow(i);

      const values = row.values
        .slice(1, 12)
        .map((value) => {
          if (value && typeof value === "object") {
            if (value.text) return value.text;
            if (value.result !== undefined) return value.result;
            if (value.hyperlink) return "[Ссылка]";
          }

          return value;
        });

      console.log(`Строка ${i}:`, JSON.stringify(values));
    }
  });
}

main().catch((error) => {
  console.error("Ошибка:", error.message);
});
