const fs = require("fs");
const path = require("path");

const FILE = path.join(
  __dirname,
  "all-apartments.json"
);

const apartments = JSON.parse(
  fs.readFileSync(FILE, "utf8")
);

// Поля, которые создает сама наша программа.
// Их не анализируем как характеристики квартиры.
const SYSTEM_FIELDS = new Set([
  "agency",
  "sourceSpreadsheet",
  "sourceSheet",
  "sourceRow",
  "sourceUrl"
]);

console.log("\n🔎 АНАЛИЗ ДАННЫХ ПО АГЕНТСТВАМ\n");

// Группируем объекты по агентствам
const agencies = {};

for (const apartment of apartments) {
  const agency =
    apartment.agency || "Без агентства";

  if (!agencies[agency]) {
    agencies[agency] = [];
  }

  agencies[agency].push(apartment);
}

const agencyNames =
  Object.keys(agencies).sort();

for (const agency of agencyNames) {
  const items = agencies[agency];

  console.log(
    "\n======================================"
  );

  console.log(`🏢 ${agency}`);
  console.log(`🏠 Объектов: ${items.length}`);

  // Считаем заполненность каждого поля
  const fieldCounts = {};

  for (const item of items) {
    for (const [field, value] of Object.entries(item)) {
      if (SYSTEM_FIELDS.has(field)) {
        continue;
      }

      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        continue;
      }

      fieldCounts[field] =
        (fieldCounts[field] || 0) + 1;
    }
  }

  console.log("\n📊 Распознанные поля:");

  if (Object.keys(fieldCounts).length === 0) {
    console.log("   Ничего не распознано");
  } else {
    Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        const percent = (
          (count / items.length) *
          100
        ).toFixed(0);

        console.log(
          `   ${field}: ${count}/${items.length} (${percent}%)`
        );
      });
  }

  // Показываем пример объекта
  console.log("\n🧾 Пример:");

  const example = items[0];

  for (const [field, value] of Object.entries(example)) {
    if (SYSTEM_FIELDS.has(field)) {
      continue;
    }

    console.log(
      `   ${field}: ${value}`
    );
  }
}

console.log(
  "\n======================================"
);

console.log(
  "\n✅ Анализ закончен.\n"
);
