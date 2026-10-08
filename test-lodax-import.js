
const { google } = require("googleapis");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const { normalizeRow } = require("./normalize");

const FILE_ID = "12x3CSiw2B_Zm4vyQweI_PsKrc35dvhP1";

const COLUMN_MAP = {
  1: "location",
  2: "complex",
  3: "type",
  4: "floor",
  5: "area",
  6: "furniture",
  7: "exposure",
  8: "view",
  9: "maintenance",
  10: "act16",
  11: "price",
  12: "notes",
  13: "commission",
  14: "photo"
};

function cellValue(cell) {
  const value = cell.value;

  if (value == null) return null;

  if (value instanceof Date) {
  const format = String(cell.numFmt || "").toLowerCase();

  if (format === "d/m" || format === "dd/mm") {
    const day = value.getUTCDate();
    const month = value.getUTCMonth() + 1;

    return `${day}/${month}`;
  }

  return null;
} // Не выдаём ошибочную дату за этаж
  

  if (typeof value === "object") {
    if (value.hyperlink) {
      return value.hyperlink;
    }

    if (value.richText) {
      return value.richText.map(x => x.text).join("");
    }

    if (value.result !== undefined) {
      return value.result;
    }

    if (value.text !== undefined) {
      return value.text;
    }

    return null;
  }

  return value;
}

async function main() {
  const token = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "token.json"),
      "utf8"
    )
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

  console.log("Загружаем Lodax из Google Drive...");

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

  const apartments = [];
  let skipped = 0;
  let suspiciousFloors = 0;

  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 7; rowNumber <= sheet.rowCount; rowNumber++) {
      const excelRow = sheet.getRow(rowNumber);

      const values = [];

      for (let col = 1; col <= 15; col++) {
        values.push(cellValue(excelRow.getCell(col)));
      }

      const rawFloor = excelRow.getCell(5).value;

      if (rawFloor instanceof Date) {
        suspiciousFloors++;
      }
// Пропускаем проданные объекты с красной заливкой
const complexCell = excelRow.getCell(3);

const fillColor = complexCell.fill?.fgColor?.argb;

if (String(fillColor || "").toUpperCase() === "FFFF0000") {
  skipped++;
  continue;
}
      const apartment = normalizeRow(
        values,
        COLUMN_MAP,
        {
          agency: "Lodax",
          sourceType: "google-drive-excel",
          sourceFileId: FILE_ID,
          sourceSheet: sheet.name,
          sourceRow: rowNumber
        }
      );

      const valid =
        apartment.price > 0 &&
        apartment.area > 0 &&
        apartment.location &&
        apartment.complex &&
        apartment.type;

      if (!valid) {
        skipped++;
        continue;
      }

      apartments.push(apartment);
    }
  }

  console.log("\nРЕЗУЛЬТАТ ПРОВЕРКИ LODAX");
  console.log("Найдено объектов:", apartments.length);
  console.log("Пропущено строк:", skipped);
  console.log("Подозрительных этажей:", suspiciousFloors);

  console.log("\nПЕРВЫЕ 5 ОБЪЕКТОВ:");

  for (const apartment of apartments.slice(0, 5)) {
    console.log("\n------------------");
    console.log("Город:", apartment.location);
    console.log("Комплекс:", apartment.complex);
    console.log("Тип:", apartment.type);
    console.log("Площадь:", apartment.area);
    console.log("Цена:", apartment.price);
    console.log("Этаж:", apartment.floor);
    console.log("Фото:", apartment.photo);
  }

  console.log("\nБаза квартир не изменена.");
}

main().catch(error => {
  console.error("ОШИБКА:", error.message);
});
