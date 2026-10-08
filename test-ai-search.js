
const {
  understandRequest,
  searchApartments
} = require("./ai-search");

async function main() {
  const request =
    "Найди двухкомнатную квартиру в Святом Власе до 100000 евро";

  console.log("\n🤖 Запрос:", request);

  try {
    const filters = await understandRequest(request);

    console.log("\n🔎 ИИ определил параметры:");
    console.log(filters);

    const results = searchApartments(filters);

    console.log("\n🏠 Найдено квартир:", results.length);
    console.log("");

    results.slice(0, 10).forEach((apartment, index) => {
      console.log(
        `${index + 1}. ${apartment.complex || "Комплекс не указан"}`
      );

      console.log(
        `📍 Город: ${apartment.location || "Не указан"}`
      );

      console.log(`💶 Цена: ${apartment.price} €`);

      console.log(
        `📐 Площадь: ${apartment.area || "Не указана"} м²`
      );

      console.log(`🏢 Агентство: ${apartment.agency}`);

      console.log(
        `🔗 Источник: ${apartment.sourceUrl || "Не указан"}`
      );

      console.log("----------------------------------");
    });
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  }
}

main();
