const fs = require("fs");
const path = require("path");


// ==========================================
// ФАЙЛ БАЗЫ
// ==========================================

const FILE_PATH = path.join(
  __dirname,
  "all-apartments.json"
);


// ==========================================
// ЧИТАЕМ БАЗУ
// ==========================================

const apartments = JSON.parse(
  fs.readFileSync(FILE_PATH, "utf8")
);


console.log("\n🔍 ПРОВЕРКА БАЗЫ\n");

console.log(
  `🏠 Всего объектов: ${apartments.length}`
);


// ==========================================
// ПРОВЕРКА ЗАПОЛНЕННОСТИ
// ==========================================

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}


function countField(field) {
  return apartments.filter(
    (apartment) =>
      hasValue(apartment[field])
  ).length;
}


function percent(count) {
  if (apartments.length === 0) {
    return "0.0";
  }

  return (
    (count / apartments.length) *
    100
  ).toFixed(1);
}


const fields = [
  ["price", "Цена"],
  ["area", "Площадь"],
  ["location", "Локация"],
  ["complex", "Комплекс"],
  ["type", "Тип / комнаты"],
  ["floor", "Этаж"],
  ["view", "Вид"],
  ["maintenance", "Такса"],
  ["furniture", "Мебель"],
  ["commission", "Комиссия"],
  ["notes", "Примечания"],
  ["installment", "Рассрочка"],
  ["firstPayment", "Первый взнос"],
  ["photo", "Фото"],
  ["listingUrl", "Ссылка"],
  ["status", "Статус"]
];


console.log(
  "\n========== ЗАПОЛНЕННОСТЬ =========="
);


for (const [field, label] of fields) {

  const count =
    countField(field);

  console.log(
    `${label}: ${count} из ${apartments.length} (${percent(count)}%)`
  );

}


// ==========================================
// НОРМАЛЬНАЯ ЧИСЛОВАЯ ЦЕНА
// ==========================================

const normalNumericPrices =
  apartments.filter(
    (apartment) =>
      typeof apartment.price === "number" &&
      Number.isFinite(apartment.price) &&
      apartment.price > 0
  );


console.log(
  `\n💰 С нормальной числовой ценой: ${normalNumericPrices.length}`
);


// ==========================================
// ЦЕНА + ЛОКАЦИЯ
// ==========================================

const priceAndLocation =
  apartments.filter(
    (apartment) =>
      typeof apartment.price === "number" &&
      Number.isFinite(apartment.price) &&
      apartment.price > 0 &&
      hasValue(apartment.location)
  );


console.log(
  `📍 Цена + локация: ${priceAndLocation.length}`
);


// ==========================================
// ЦЕНА + ЛОКАЦИЯ + ТИП
// ==========================================

const searchable =
  apartments.filter(
    (apartment) =>
      typeof apartment.price === "number" &&
      Number.isFinite(apartment.price) &&
      apartment.price > 0 &&
      hasValue(apartment.location) &&
      hasValue(apartment.type)
  );


console.log(
  `🔎 Цена + локация + тип: ${searchable.length}`
);


// ==========================================
// ПОДОЗРИТЕЛЬНЫЕ ЦЕНЫ
// ==========================================

const suspicious =
  apartments.filter(
    (apartment) => {

      const price =
        apartment.price;

      if (
        typeof price !== "number" ||
        !Number.isFinite(price)
      ) {
        return false;
      }

      // Для квартир в нашей базе:
      // меньше 20 000 € или больше 2 000 000 €
      // считаем подозрительным значением.

      return (
        price < 20000 ||
        price > 2000000
      );
    }
  );


console.log(
  `\n⚠️ Подозрительных цен: ${suspicious.length}`
);


// ==========================================
// СТАТИСТИКА ПО АГЕНТСТВАМ
// ==========================================

console.log(
  "\n========== ПО АГЕНТСТВАМ ==========\n"
);


const agencies = {};


for (const apartment of apartments) {

  const agency =
    apartment.agency ||
    "Без агентства";

  agencies[agency] =
    (agencies[agency] || 0) + 1;

}


Object.entries(agencies)
  .sort((a, b) => b[1] - a[1])
  .forEach(
    ([agency, count]) => {

      console.log(
        `${agency}: ${count}`
      );

    }
  );


// ==========================================
// ПОДРОБНО ПО ПОДОЗРИТЕЛЬНЫМ ЦЕНАМ
// ==========================================

console.log(
  "\n===================================="
);

console.log(
  "\n========== ПОДОЗРИТЕЛЬНЫЕ ЦЕНЫ =========="
);


if (suspicious.length === 0) {

  console.log(
    "\n✅ Подозрительных цен нет."
  );

} else {

  suspicious.forEach(
    (apartment, index) => {

      console.log(
        `\n⚠️ ОБЪЕКТ ${index + 1}`
      );

      console.log(
        "Агентство:",
        apartment.agency || "—"
      );

      console.log(
        "Локация:",
        apartment.location || "—"
      );

      console.log(
        "Комплекс:",
        apartment.complex || "—"
      );

      console.log(
        "Тип:",
        apartment.type || "—"
      );

      console.log(
        "Площадь:",
        apartment.area ?? "—"
      );

      console.log(
        "Цена:",
        apartment.price
      );

      console.log(
        "Статус:",
        apartment.status || "—"
      );

      console.log(
        "Примечание:",
        apartment.notes || "—"
      );

      console.log(
        "Агентская таблица:",
        apartment.sourceSpreadsheet || "—"
      );

      console.log(
        "Лист:",
        apartment.sourceSheet || "—"
      );

      console.log(
        "Строка:",
        apartment.sourceRow || "—"
      );

      console.log(
        "Источник:",
        apartment.sourceUrl || "—"
      );

      console.log(
        "------------------------------------"
      );

    }
  );

}


console.log(
  `\n⚠️ Всего подозрительных: ${suspicious.length}`
);


console.log(
  "\n===================================="
);

console.log(
  "✅ Проверка закончена.\n"
);
