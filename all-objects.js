
"use strict";

process.loadEnvFile(require("node:path").join(__dirname, ".env"));

const fs = require("node:fs");
const path = require("node:path");
const { google } = require("googleapis");
const ExcelJS = require("exceljs");

const {
  recognizeColumn,
  createColumnMap,
  normalizeRow
} = require("./normalize");

const { cleanApartments } = require("./data-cleaner");

const TOKEN_PATH = path.join(__dirname, "token.json");
const OUTPUT_PATH = path.join(__dirname, "all-apartments.json");
const PREVIEW_PATH = path.join(__dirname, "all-apartments-preview.json");

const CATALOG_ID = "1qkTTO-Q79JcuK0P_fjboiaQQMHoY8SOuWfl5ntOK64E";
const LODAX_ID = process.env.LODAX_ID;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 52;

const APPLY = process.argv.includes("--apply");
const LODAX_ONLY = process.argv.includes("--lodax-only");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// GOOGLE API
// ==========================================

async function safeRequest(fn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await sleep(350);
      return await fn();
    } catch (error) {
      const status = Number(error.response?.status || error.code);

      if (
        [429, 500, 502, 503, 504].includes(status) &&
        attempt < 5
      ) {
        const wait = attempt * 4000;

        console.log(
          `⏳ Ошибка Google (${status}). Повтор через ${wait / 1000} сек.`
        );

        await sleep(wait);
        continue;
      }

      throw error;
    }
  }
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function columnLetter(index) {
  let n = index + 1;
  let result = "";

  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }

  return result;
}

function findHeaderRow(rows) {
  let index = -1;
  let score = 0;

  rows.slice(0, 60).forEach((row, i) => {
    const current = (row || []).filter(
      cell => recognizeColumn(cell)
    ).length;

    if (current > score) {
      score = current;
      index = i;
    }
  });

  return { index, score };
}

function isRentalTab(name) {
  const text = String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е");

  return [
    "аренда",
    "аренди",
    "аренду",
    "аренды",
    "наем",
    "под наем",
    "rent",
    "rental",
    "lease",
    "letting"
  ].some(word => text.includes(word));
}

function isUsefulObject(object) {
  const count = [
    "price",
    "area",
    "type",
    "complex",
    "location",
    "floor"
  ].filter(key =>
    object[key] != null &&
    String(object[key]).trim() !== ""
  ).length;

  const text = [
    object.status,
    object.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const unavailable = [
    "продано",
    "продан",
    "продаден",
    "sold",
    "stop",
    "стоп",
    "не активна",
    "не продается",
    "не продаётся",
    "reserved",
    "резерв",
    "бронь"
  ];

  return (
    count >= 2 &&
    !unavailable.some(word => text.includes(word))
  );
}

// ==========================================
// ФОТОГРАФИИ И ССЫЛКИ
// ==========================================

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(
    String(value || "").trim()
  );
}

function extractUrls(value) {
  return (
    String(value || "").match(
      /https?:\/\/[^\s,;<>"']+/gi
    ) || []
  ).map(url => url.replace(/[.)\]]+$/, ""));
}

function unique(values) {
  return [...new Set(values.filter(isUrl))];
}

function cellLinks(cell) {
  if (!cell) return [];

  const urls = [];

  if (cell.hyperlink) {
    urls.push(cell.hyperlink);
  }

  for (const run of cell.textFormatRuns || []) {
    if (run.format?.link?.uri) {
      urls.push(run.format.link.uri);
    }
  }

  const formula = cell.userEnteredValue?.formulaValue || "";

  const match = formula.match(
    /^\s*=\s*HYPERLINK\s*\(\s*"((?:[^"]|"")+)"/i
  );

  if (match) {
    urls.push(match[1].replace(/""/g, '"'));
  }

  urls.push(...extractUrls(cell.formattedValue));

  return unique(urls);
}

function isPhotoHeader(value) {
  return /фото|снимк|photo|picture|галере|галерия|изображен/i.test(
    String(value || "")
  );
}

function isLinkHeader(value) {
  return /ссылк|объявлен|линк|\blink\b|\burl\b/i.test(
    String(value || "")
  );
}

function looksLikePhotoLink(url) {
  return /drive\.google\.com|photos\.app\.goo\.gl|photos\.google\.com|\.jpe?g(?:\?|$)|\.png(?:\?|$)|\.webp(?:\?|$)|dropbox\.com|mega\.nz|icloud\.com\/sharedalbum/i.test(
    url
  );
}

function assignPhotos(
  apartment,
  photoLinks,
  listingLinks,
  stats
) {
  const photoUrls = unique([
    ...extractUrls(apartment.photo),
    ...photoLinks
  ]);

  if (photoUrls.length) {
    apartment.photo = photoUrls.join("\n");
    apartment.photoUrls = photoUrls;
    stats.foundPhotoLinks++;
  }

  if (
    !isUrl(apartment.listingUrl) &&
    listingLinks.length
  ) {
    apartment.listingUrl = listingLinks[0];
  }
}

// ==========================================
// СКРЫТЫЕ ССЫЛКИ GOOGLE SHEETS
// ==========================================

async function readHyperlinks(
  sheets,
  spreadsheetId,
  tab,
  headers,
  rowCount
) {
  const photoColumns = [];
  const otherColumns = [];

  headers.slice(0, MAX_COLUMNS).forEach((header, i) => {
    if (isPhotoHeader(header)) {
      photoColumns.push(i);
    } else if (isLinkHeader(header)) {
      otherColumns.push(i);
    }
  });

  const columns = [
    ...new Set([
      ...photoColumns,
      ...otherColumns
    ])
  ];

  if (!columns.length) {
    return new Map();
  }

  const lastRow = Math.min(MAX_ROWS, rowCount);

  const ranges = columns.map(i => {
    const col = columnLetter(i);
    return `${quoteSheet(tab)}!${col}1:${col}${lastRow}`;
  });

  const result = await safeRequest(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      ranges,
      includeGridData: true,
      fields:
        "sheets(data(startRow,startColumn,rowData(values(hyperlink,textFormatRuns,userEnteredValue,formattedValue))))"
    })
  );

  const linksByRow = new Map();

  for (const sheet of result.data.sheets || []) {
    for (const block of sheet.data || []) {
      const column = block.startColumn || 0;
      const photoColumn = photoColumns.includes(column);
      const firstRow = block.startRow || 0;

      (block.rowData || []).forEach((row, offset) => {
        const rowNumber = firstRow + offset + 1;

        const urls = (
          row.values || []
        ).flatMap(cellLinks);

        if (!urls.length) return;

        const item = linksByRow.get(rowNumber) || {
          photos: [],
          listings: []
        };

        for (const url of urls) {
          if (
            photoColumn ||
            looksLikePhotoLink(url)
          ) {
            item.photos.push(url);
          } else {
            item.listings.push(url);
          }
        }

        linksByRow.set(rowNumber, item);
      });
    }
  }

  return linksByRow;
}

// ==========================================
// GOOGLE DRIVE
// ==========================================

function extractDriveId(url) {
  const text = String(url || "");

  const match = text.match(
    /(?:docs\.google\.com\/spreadsheets\/d\/|drive\.google\.com\/(?:file\/d\/|drive\/folders\/|folders\/)|docs\.google\.com\/(?:document|presentation)\/d\/)([a-zA-Z0-9_-]+)/i
  );

  if (match) return match[1];

  try {
    const parsed = new URL(text);

    if (
      /^(?:drive|docs)\.google\.com$/i.test(
        parsed.hostname
      )
    ) {
      return parsed.searchParams.get("id");
    }
  } catch (_) {}

  return null;
}

function isFolderUrl(url) {
  return /drive\.google\.com\/(?:drive\/)?folders\//i.test(
    String(url)
  );
}

function isLodax(source, fileId) {
  return (
    fileId === LODAX_ID ||
    /лодакс|lodax/i.test(source.agency)
  );
}

// ==========================================
// ЧТЕНИЕ EXCEL
// ==========================================

function excelCellValue(cell, floorColumn = false) {
  const value = cell.value;

  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    // Иногда Excel превращает этаж 3/6 в дату.
    const format = String(cell.numFmt || "")
      .toLowerCase()
      .trim();

    if (
      floorColumn &&
      /^(?:d\/m|dd\/mm|d\/mm|dd\/m)$/.test(format)
    ) {
      return (
        `${value.getUTCDate()}/` +
        `${value.getUTCMonth() + 1}`
      );
    }

    return null;
  }

  if (typeof value === "object") {
    if (value.hyperlink) {
      return value.hyperlink;
    }

    if (value.richText) {
      return value.richText
        .map(item => item.text)
        .join("");
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

// ==========================================
// ПРОДАННЫЕ КВАРТИРЫ LODAX
// ==========================================

function isRedCell(cell) {
  const fill = cell.fill || {};

  const colors = [
    fill.fgColor?.argb,
    fill.bgColor?.argb
  ];

  return colors.some(color => {
    const value = String(color || "").toUpperCase();

    return (
      value === "FFFF0000" ||
      value === "00FF0000" ||
      value === "FF0000"
    );
  });
}

function isSoldLodaxRow(row) {
  // Красная заливка означает проданный объект.
  return [2, 3, 4, 6, 12].some(
    col => isRedCell(row.getCell(col))
  );
}

function excelHeaderMap(headers) {
  const aliases = {
    "place": "location",
    "price eur": "price",
    "price euro": "price",
    "maint.fee": "maintenance",
    "maintenance fee": "maintenance",
    "included commision": "commission",
    "included commission": "commission",
    "expo": "exposure",
    "act 16": "act16"
  };

  const map = createColumnMap(headers);

  for (let i = 0; i < headers.length; i++) {
    const key = String(headers[i] || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    if (
      aliases[key] &&
      !Object.values(map).includes(aliases[key])
    ) {
      map[i] = aliases[key];
    }
  }

  return map;
}

// ==========================================
// ИМПОРТ EXCEL ИЗ GOOGLE DRIVE
// ==========================================

async function importExcel(
  drive,
  source,
  fileId,
  stats,
  allApartments
) {
  const response = await safeRequest(() =>
    drive.files.get(
      {
        fileId,
        alt: "media"
      },
      {
        responseType: "arraybuffer"
      }
    )
  );

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(
    Buffer.from(response.data)
  );

  let sourceObjects = 0;

  for (const sheet of workbook.worksheets) {
    if (isRentalTab(sheet.name)) {
      console.log(
        `🚫 Пропускаю аренду: ${sheet.name}`
      );

      stats.skippedRentalTabs++;
      continue;
    }

    const lodax = isLodax(source, fileId);

    let headerRow;
    let columnMap;

    // LODAX
    if (lodax) {
      headerRow = 5;

      columnMap = {
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

    // NEW LIFE PROPERTY
    } else if (/new life property/i.test(source.agency)) {
      headerRow = 6;

      columnMap = {
        0: "id",
        1: "type",
        2: "location",
        3: "complex",
        4: "floor",
        5: "area",
        6: "furniture",
        7: "maintenance",
        8: "price",
        9: "commission",
        10: "photo"
      };

    // KC PROPERTIES
    } else if (/kc properties/i.test(source.agency)) {
      headerRow = 3;

      columnMap = {
        0: "location",
        1: "id",
        2: "complex",
        3: "type",
        4: "floor",
        5: "area",
        6: "furniture",
        7: "view",
        8: "price",
        9: "maintenance",
        10: "commission",
        11: "photo",
        12: "notes"
      };

    // NILS
    } else if (/^nils$/i.test(source.agency.trim())) {
      headerRow = sheet.name === "Tabellenblatt2"
        ? 9
        : 4;

      columnMap = {
        0: "id",
        1: "location",
        2: "type",
        4: "complex",
        5: "floor",
        6: "area",
        7: "furniture",
        8: "maintenance",
        9: "price",
        10: "commission",
        11: "photo",
        12: "notes"
      };

    // LEO CASTLE
    } else if (/leo castle/i.test(source.agency)) {
      if (sheet.name === "Taxes") {
        continue;
      }

      headerRow = 2;

      columnMap = {
        0: "complex",
        1: "location",
        2: "type",
        3: "price",
        4: "status",
        5: "area",
        6: "floor",
        7: "view",
        8: "furniture",
        9: "maintenance",
        10: "photo",
        11: "commission"
      };

    // ОСТАЛЬНЫЕ EXCEL
    } else {
      const rows = [];

      for (
        let r = 1;
        r <= Math.min(60, sheet.rowCount);
        r++
      ) {
        const values = [];

        for (
          let c = 1;
          c <= Math.min(MAX_COLUMNS, sheet.columnCount);
          c++
        ) {
          values.push(
            excelCellValue(
              sheet.getRow(r).getCell(c)
            )
          );
        }

        rows.push(values);
      }

      const result = findHeaderRow(rows);

      if (
        result.index < 0 ||
        result.score < 2
      ) {
        console.log(
          `⚪ Excel лист ${sheet.name}: заголовки не распознаны`
        );
        continue;
      }

      headerRow = result.index + 1;
      columnMap = excelHeaderMap(rows[result.index]);
    }

    if (
      !Object.values(columnMap).includes("price") ||
      !Object.values(columnMap).includes("area")
    ) {
      console.log(
        `⚪ Excel лист ${sheet.name}: нет распознанных цены и площади`
      );
      continue;
    }

    let tabObjects = 0;

    const firstDataRow = lodax
      ? 7
      : headerRow + 1;

    for (
      let rowNumber = firstDataRow;
      rowNumber <= Math.min(MAX_ROWS, sheet.rowCount);
      rowNumber++
    ) {
      const row = sheet.getRow(rowNumber);

      if (
        lodax &&
        isSoldLodaxRow(row)
      ) {
        stats.soldLodax++;
        continue;
      }

      const values = [];
      const photoLinks = [];
      const listingLinks = [];

      let inferredFloor = false;

      const photoCols = Object.entries(columnMap)
        .filter(([, field]) => field === "photo")
        .map(([i]) => Number(i) + 1);

      const listingCols = Object.entries(columnMap)
        .filter(([, field]) => field === "listingUrl")
        .map(([i]) => Number(i) + 1);

      const floorCols = Object.entries(columnMap)
        .filter(([, field]) => field === "floor")
        .map(([i]) => Number(i) + 1);

      for (
        let c = 1;
        c <= Math.min(MAX_COLUMNS, sheet.columnCount);
        c++
      ) {
        const cell = row.getCell(c);
        const floorColumn = floorCols.includes(c);

        if (
          floorColumn &&
          cell.value instanceof Date &&
          excelCellValue(cell, true) != null
        ) {
          inferredFloor = true;
        }

        const safeValue = excelCellValue(
          cell,
          floorColumn
        );

        values.push(
          safeValue == null ? "" : safeValue
        );

        const link =
          cell.hyperlink ||
          (
            cell.value &&
            typeof cell.value === "object"
              ? cell.value.hyperlink
              : null
          );

        let cellText = "";

        try {
          cellText = cell.text || "";
        } catch (_) {}

        const urls = unique([
          ...(link ? [link] : []),
          ...extractUrls(cellText)
        ]);

        for (const url of urls) {
          if (
            photoCols.includes(c) ||
            looksLikePhotoLink(url)
          ) {
            photoLinks.push(url);
          } else if (
            listingCols.includes(c)
          ) {
            listingLinks.push(url);
          }
        }
      }

      if (
        values.every(
          value =>
            value == null ||
            String(value).trim() === ""
        )
      ) {
        continue;
      }

      const apartment = normalizeRow(
        values,
        columnMap,
        {
          agency: source.agency,
          sourceSpreadsheet:
            source.fileName || source.agency,
          sourceSheet: sheet.name,
          sourceRow: rowNumber,
          sourceUrl: source.url,
          sourceFileId: fileId,
          sourceType: "google-drive-excel"
        }
      );

      // KC Properties: пропускаем проданные объекты.
      if (/kc properties/i.test(source.agency)) {
        const priceText = String(
          values[8] ?? ""
        ).trim();

        if (
          /\b(sold|reserved)\b/i.test(priceText) ||
          /продаден|продадено|резервиран/i.test(priceText)
        ) {
          continue;
        }
      }

      if (inferredFloor) {
        apartment.floorInferredFromExcelDate = true;
      }

      if (!isUsefulObject(apartment)) {
        continue;
      }

      if (
        lodax &&
        !(
          apartment.price > 0 &&
          apartment.area > 0 &&
          apartment.location &&
          apartment.complex &&
          apartment.type
        )
      ) {
        continue;
      }

      assignPhotos(
        apartment,
        photoLinks,
        listingLinks,
        stats
      );

      allApartments.push(apartment);

      tabObjects++;
      sourceObjects++;
    }

    console.log(
      `📄 Excel: ${sheet.name}, заголовки: ${headerRow}, объектов: ${tabObjects}`
    );
  }

  if (sourceObjects === 0) {
    throw new Error(
      "Excel прочитан, но не найдено подходящих объектов; проверьте структуру файла"
    );
  }

  return sourceObjects;
}

// ==========================================
// ИМПОРТ GOOGLE SHEETS
// ==========================================

async function importGoogleSheet(
  sheets,
  source,
  spreadsheetId,
  stats,
  allApartments
) {
  const spreadsheet = await safeRequest(() =>
    sheets.spreadsheets.get({
      spreadsheetId
    })
  );

  const spreadsheetTitle =
    spreadsheet.data.properties?.title ||
    source.agency;

  const tabs = (
    spreadsheet.data.sheets || []
  ).map(sheet => ({
    title: sheet.properties.title,
    gid: sheet.properties.sheetId
  }));

  let sourceObjects = 0;

  for (const sheetInfo of tabs) {
    const tab = sheetInfo.title;

    if (isRentalTab(tab)) {
      console.log(
        `🚫 Пропускаю аренду: ${tab}`
      );

      stats.skippedRentalTabs++;
      continue;
    }

    const response = await safeRequest(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${quoteSheet(tab)}!A1:AZ${MAX_ROWS}`
      })
    );

    const rows = response.data.values || [];

    if (!rows.length) {
      continue;
    }

    const result = findHeaderRow(rows);

    if (
      result.index === -1 ||
      result.score < 2
    ) {
      continue;
    }

    const headerIndex = result.index;
    const headers = rows[headerIndex] || [];
    const columnMap = createColumnMap(headers);

    console.log(
      `📄 ${tab} — заголовки: ${headerIndex + 1}, колонок: ${Object.keys(columnMap).length}`
    );

    const linksByRow = await readHyperlinks(
      sheets,
      spreadsheetId,
      tab,
      headers,
      rows.length
    );

    let tabObjects = 0;

    for (
      let rowIndex = headerIndex + 1;
      rowIndex < rows.length;
      rowIndex++
    ) {
      const row = rows[rowIndex];

      if (
        !row ||
        row.every(
          cell => String(cell || "").trim() === ""
        )
      ) {
        continue;
      }

      const apartment = normalizeRow(
        row,
        columnMap,
        {
          agency: source.agency,
          sourceSpreadsheet: spreadsheetTitle,
          sourceSheet: tab,
          sourceGid: sheetInfo.gid,
          sourceRow: rowIndex + 1,
          sourceUrl: source.url
        }
      );

      if (!isUsefulObject(apartment)) {
        continue;
      }

      const links = linksByRow.get(rowIndex + 1);

      if (links) {
        assignPhotos(
          apartment,
          links.photos,
          links.listings,
          stats
        );
      }

      allApartments.push(apartment);

      tabObjects++;
      sourceObjects++;
    }

    console.log(
      `🏠 Объектов: ${tabObjects}`
    );
  }

  return sourceObjects;
}

// ==========================================
// УДАЛЕНИЕ ДУБЛЕЙ FESTIVAL
// ==========================================


function deduplicateFestival(apartments) {
  let removed = 0;

  const result = apartments.filter(apartment => {
    const agency = String(apartment.agency ?? "")
      .trim()
      .toLowerCase();

    const sheet = String(apartment.sourceSheet ?? "")
      .trim()
      .toLowerCase();

    if (agency === "festival" && sheet === "лист1") {
      removed++;
      return false;
    }

    return true;
  });

  console.log(
    `🔁 Удалено русских дублей Festival: ${removed}`
  );

  return result;
}
  
// ==========================================
// ГЛАВНАЯ ФУНКЦИЯ
// ==========================================

async function main() {
  console.log(
    `\n🏠 FOX HOUSE AI — ${
      APPLY
        ? "ОБНОВЛЕНИЕ"
        : "ПРЕДПРОСМОТР БЕЗ ИЗМЕНЕНИЯ БАЗЫ"
    }\n`
  );

  // Авторизация Google.
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

  const drive = google.drive({
    version: "v3",
    auth
  });

  const stats = {
    processedSources: 0,
    processedSheets: 0,
    processedExcel: 0,
    unsupportedDocuments: 0,
    otherLinks: 0,
    errors: 0,
    skippedRentalTabs: 0,
    foundPhotoLinks: 0,
    soldLodax: 0
  };

  const allApartments = [];

  let catalog;

  // Режим проверки только Lodax.
  if (LODAX_ONLY) {
    catalog = [
      {
        agency: "Lodax",
        url: `https://drive.google.com/file/d/${LODAX_ID}/view`
      }
    ];
  } else {
    console.log("📚 Читаю каталог...");

    const meta = await safeRequest(() =>
      sheets.spreadsheets.get({
        spreadsheetId: CATALOG_ID
      })
    );

    const tab =
      meta.data.sheets[0].properties.title;

    const response = await safeRequest(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: CATALOG_ID,
        range: `${quoteSheet(tab)}!A:B`
      })
    );

    catalog = (
      response.data.values || []
    )
      .slice(1)
      .filter(row => row[0] && row[1])
      .map(row => ({
        agency: String(row[0]).trim(),
        url: String(row[1]).trim()
      }));
  }

  console.log(
    `📋 Источников: ${catalog.length}`
  );

  // ========================================
  // ОБРАБАТЫВАЕМ ВСЕ ИСТОЧНИКИ
  // ========================================

  for (
    let i = 0;
    i < catalog.length;
    i++
  ) {
    const source = catalog[i];

    console.log(
      `\n🏢 ${i + 1}/${catalog.length} — ${source.agency}`
    );

    const fileId = extractDriveId(source.url);

    if (!fileId) {
      console.log(
        "⚪ Ссылка не на Google Drive/Sheets — пропускаю"
      );

      stats.otherLinks++;
      continue;
    }

    if (isFolderUrl(source.url)) {
      console.log(
        "⚪ Ссылка на папку — пропускаю"
      );

      stats.unsupportedDocuments++;
      continue;
    }

    try {
      const metadata = await safeRequest(() =>
        drive.files.get({
          fileId,
          fields: "id,name,mimeType",
          supportsAllDrives: true
        })
      );

      const mime =
        metadata.data.mimeType || "";

      source.fileName =
        metadata.data.name ||
        source.agency;

      let count;

      if (
        mime ===
        "application/vnd.google-apps.spreadsheet"
      ) {
        count = await importGoogleSheet(
          sheets,
          source,
          fileId,
          stats,
          allApartments
        );

        stats.processedSheets++;

      } else if (
        mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        count = await importExcel(
          drive,
          source,
          fileId,
          stats,
          allApartments
        );

        stats.processedExcel++;

      } else {
        console.log(
          `🟠 Неподдерживаемый тип: ${mime} (${source.fileName})`
        );

        stats.unsupportedDocuments++;
        continue;
      }

      stats.processedSources++;

      console.log(
        `✅ Всего у источника: ${count}`
      );

    } catch (error) {
      console.log(
        `❌ Ошибка источника: ${error.response?.status || ""} ${error.message}`
      );

      console.error("ПОДРОБНОСТИ ОШИБКИ:");
      console.error(error.stack);

      stats.errors++;
    }
  }

  // ========================================
  // ПРОВЕРЯЕМ ДАННЫЕ
  // ========================================

  console.log(
    "\n🧹 Очищаю и проверяю данные..."
  );

  if (
    stats.errors ||
    stats.processedSources === 0
  ) {
    console.log(
      `❌ Ошибок: ${stats.errors}. Старая база не изменена.`
    );

    process.exitCode = 1;
    return;
  }

  // Проверяем, что основные Google Sheets доступны.
  if (
    !LODAX_ONLY &&
    stats.processedSheets < 21
  ) {
    console.log(
      `❌ Прочитано только ${stats.processedSheets} Google Sheets из ожидаемых 21. Сохранение отменено.`
    );

    process.exitCode = 1;
    return;
  }

  // Сначала общая очистка.
  // Затем удаление дублей Festival.
  const cleanedApartments = deduplicateFestival(
    cleanApartments(allApartments)
  );

  if (!Array.isArray(cleanedApartments)) {
    throw new Error(
      "cleanApartments вернул не массив"
    );
  }

  // Защита от случайной потери базы.
  if (
    !LODAX_ONLY &&
    cleanedApartments.length < 900
  ) {
    console.log(
      `❌ Осталось только ${cleanedApartments.length} объектов. Сохранение отменено.`
    );

    process.exitCode = 1;
    return;
  }

  // ========================================
  // СОХРАНЯЕМ БАЗУ
  // ========================================

  const output =
    APPLY && !LODAX_ONLY
      ? OUTPUT_PATH
      : PREVIEW_PATH;

  const temp = output + ".tmp";

  try {
    fs.writeFileSync(
      temp,
      JSON.stringify(
        cleanedApartments,
        null,
        2
      ),
      "utf8"
    );

    if (
      APPLY &&
      !LODAX_ONLY &&
      fs.existsSync(OUTPUT_PATH)
    ) {
      const backup = path.join(
        __dirname,
        "all-apartments-before-excel.json"
      );

      fs.copyFileSync(
        OUTPUT_PATH,
        backup
      );

      console.log(
        `🛡️ Резервная копия: ${backup}`
      );
    }

    fs.renameSync(
      temp,
      output
    );

  } finally {
    if (fs.existsSync(temp)) {
      fs.unlinkSync(temp);
    }
  }

  // ========================================
  // ИТОГОВЫЙ ОТЧЁТ
  // ========================================

  console.log(
    "\n========================================="
  );

  console.log(
    `🏢 Источников: ${stats.processedSources} (Sheets: ${stats.processedSheets}, Excel: ${stats.processedExcel})`
  );

  console.log(
    `🏠 Объектов после очистки: ${cleanedApartments.length}`
  );

  console.log(
    `📸 Объектов со ссылками на фото: ${
      cleanedApartments.filter(apartment =>
        Array.isArray(apartment.photoUrls)
          ? apartment.photoUrls.length > 0
          : Boolean(apartment.photo)
      ).length
    }`
  );

  console.log(
    `🔴 Проданных Lodax пропущено: ${stats.soldLodax}`
  );

  console.log(
    `🚫 Пропущено вкладок аренды: ${stats.skippedRentalTabs}`
  );

  console.log(
    `🟠 Неподдерживаемых документов: ${stats.unsupportedDocuments}`
  );

  console.log(
    `⚪ Других ссылок: ${stats.otherLinks}`
  );

  console.log(
    `❌ Ошибок: ${stats.errors}`
  );

  console.log(
    `💾 Сохранено: ${output}`
  );

  console.log(
    APPLY && !LODAX_ONLY
      ? "✅ ОСНОВНАЯ БАЗА ОБНОВЛЕНА"
      : "🔎 Только предпросмотр — основная база НЕ ИЗМЕНЕНА"
  );
}

main().catch(error => {
  console.error(
    "❌ КРИТИЧЕСКАЯ ОШИБКА:",
    error.message
  );

  process.exitCode = 1;
});
