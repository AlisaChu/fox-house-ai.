
const apartments = require("./all-apartments.json");

const suspicious = [];

for (const apartment of apartments) {
  const problems = [];

  const price = Number(apartment.price);
  const area = Number(apartment.area);

  if (!Number.isFinite(price) || price <= 0) {
    problems.push("Не указана корректная цена");
  }

  if (!Number.isFinite(area) || area <= 0) {
    problems.push("Не указана корректная площадь");
  }

  // Предварительный порог для проверки квартир
  // Это не доказательство ошибки в цене
  if (
    apartment.type === "1-bedroom" &&
    price > 0 &&
    price < 30000
  ) {
    problems.push("Подозрительно низкая цена");
  }

  if (problems.length > 0) {
    suspicious.push({
      agency: apartment.agency,
      complex: apartment.complex,
      location: apartment.location,
      price: apartment.price,
      area: apartment.area,
      sourceSheet: apartment.sourceSheet,
      sourceRow: apartment.sourceRow,
      sourceUrl: apartment.sourceUrl,
      problems
    });
  }
}

console.log("\n🔎 ПРОВЕРКА ПРАЙС-ЛИСТОВ");
console.log("Всего объектов:", apartments.length);
console.log("Требуют проверки:", suspicious.length);

console.log(
  "Без корректной цены:",
  suspicious.filter(x =>
    x.problems.includes("Не указана корректная цена")
  ).length
);

console.log(
  "Без корректной площади:",
  suspicious.filter(x =>
    x.problems.includes("Не указана корректная площадь")
  ).length
);

console.log(
  "Подозрительно низкая цена:",
  suspicious.filter(x =>
    x.problems.includes("Подозрительно низкая цена")
  ).length
);

for (const [index, item] of suspicious.entries()) {
  console.log(`\n${index + 1}. ${item.complex || "Без названия"}`);
  console.log("Агентство:", item.agency);
  console.log("Город:", item.location);
  console.log("Цена:", item.price, "€");
  console.log("Площадь:", item.area, "м²");
  console.log("Проблемы:", item.problems.join(", "));
  console.log("Строка:", item.sourceRow);
  console.log("Источник:", item.sourceUrl);
}
