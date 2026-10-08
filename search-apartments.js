
const { verifiedApartments } = require("./verified-apartments");
const { normalizeLocation } = require("./locations");

// ==========================================
// ПАРАМЕТРЫ ПОИСКА
// ==========================================

const city = "Святой Влас";
const maxPrice = 120000;
const propertyType = "1-bedroom";
const limit = 20;

// ==========================================
// НОРМАЛИЗАЦИЯ
// ==========================================

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .trim();
}

// ==========================================
// ПОИСК КВАРТИР
// ==========================================

const results = verifiedApartments
  .filter((apartment) => {
    const apartmentCity = normalizeLocation(
      apartment.location || ""
    );

    const searchCity = normalizeLocation(city);

    const price = Number(apartment.price);

    const correctCity =
      normalize(apartmentCity) === normalize(searchCity);

    const correctType =
      apartment.type === propertyType;

    const correctPrice =
      Number.isFinite(price) &&
      price > 0 &&
      price <= maxPrice;

    // Объекты с изменившимися данными
    // требуют повторной проверки
    const safePrice =
      apartment.priceStatus !== "review_required";

    // Не предлагаем подозрительно дешёвые
    // двухкомнатные квартиры без подтверждения
    const suspiciousPrice =
      apartment.type === "1-bedroom" &&
      price < 30000 &&
      apartment.priceStatus !== "broker_verified";

    return (
      correctCity &&
      correctType &&
      correctPrice &&
      safePrice &&
      !suspiciousPrice
    );
  })
  .sort((a, b) => Number(a.price) - Number(b.price));

// ==========================================
// РЕЗУЛЬТАТЫ
// ==========================================

console.log("\n🏠 НАЙДЕННЫЕ КВАРТИРЫ\n");

console.log("Всего найдено:", results.length);
console.log("");

if (results.length === 0) {
  console.log("По заданным параметрам квартиры не найдены.");
}

results.slice(0, limit).forEach((apartment, index) => {
  const price = Number(apartment.price);

  const area =
    Number(apartment.area) > 0
      ? apartment.area
      : "Не указана";

  console.log(
    `${index + 1}. ${apartment.complex || "Комплекс не указан"}`
  );

  console.log(
    `📍 Город: ${apartment.location || "Не указан"}`
  );

  console.log(`💶 Цена: ${price} €`);
  console.log(`📐 Площадь: ${area} м²`);

  console.log(
    `🏢 Агентство: ${apartment.agency || "Не указано"}`
  );

  if (apartment.priceStatus === "broker_verified") {
    console.log("✅ Цена исправлена и подтверждена брокером");
  }

  console.log(
    `🔗 Источник: ${apartment.sourceUrl || "Не указан"}`
  );

  console.log("----------------------------------");
});
