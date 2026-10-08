// normalize.js
// Универсальная нормализация колонок прайсов недвижимости


// ==========================================
// ПОДГОТОВКА ТЕКСТА
// ==========================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[➤🔍€$]/g, " ")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}


// ==========================================
// РАСПОЗНАВАНИЕ КОЛОНОК
// ==========================================

function recognizeColumn(header) {
  const text = normalizeText(header);

  if (!text) return null;


  // ----------------------------------------
  // ID / НОМЕР ОБЪЕКТА
  // ----------------------------------------

  if (
    text === "id" ||
    text === "ref. №" ||
    text === "ref №" ||
    text === "номер" ||
    text === "№"
  ) {
    return "id";
  }


  // ----------------------------------------
  // ЛОКАЦИЯ / ГОРОД
  // ----------------------------------------

  if (
    text === "city" ||
    text === "город" ||
    text === "град" ||
    text === "region" ||
    text === "location" ||
    text === "локация" ||
    text === "местоположение" ||
    text === "нас. място" ||
    text === "населенный пункт" ||
    text === "location apartments"
  ) {
    return "location";
  }


  // ----------------------------------------
  // КОМПЛЕКС
  // ----------------------------------------

  if (
    text === "complex" ||
    text === "complex name" ||
    text === "комплекс" ||
    text === "комплекс / район" ||
    text === "комплекс/район" ||
    text === "название комплекса" ||
    text === "наименование комплекса" ||
    text.includes("комплекс/район")
  ) {
    return "complex";
  }


  // ----------------------------------------
  // ТИП / КОМНАТЫ / СПАЛЬНИ
  // ----------------------------------------

  if (
    text === "type" ||
    text === "тип" ||
    text === "тип недвижимости" ||
    text === "room" ||
    text === "rooms" ||
    text === "bedroom" ||
    text === "спални" ||
    text === "стаи" ||
    text === "комнат" ||
    text === "кол-во комнат" ||
    text === "к-во комнат" ||
    text === "количество комнат" ||
    text === "кол-во спален" ||
    text === "брой спални" ||
    /^\d+\s*bedroom$/.test(text)
  ) {
    return "type";
  }


  // ----------------------------------------
  // ПЛОЩАДЬ
  // ----------------------------------------

  if (
    text === "area" ||
    text === "size" ||
    text === "sqm" ||
    text === "m2" ||
    text === "m²" ||
    text === "м²" ||
    text === "sq/m" ||
    text === "square m2" ||
    text === "living area" ||
    text === "total area" ||
    text === "площадь" ||
    text === "площ" ||
    text === "обща площ" ||
    text === "общая площадь" ||
    text.includes("общая площадь") ||
    text.includes("обща площ") ||
    text.includes("площадь (") ||
    text.includes("площадь,") ||
    text.includes("площ (кв.м") ||
    text.includes("застроена площ")
  ) {
    return "area";
  }


  // ----------------------------------------
  // ЭТАЖ
  // ----------------------------------------

  if (
    text === "floor" ||
    text === "этаж" ||
    text === "етаж"
  ) {
    return "floor";
  }


  // ----------------------------------------
  // ЦЕНА
  // ----------------------------------------

  // Важно: "цена на кв.м" не считаем
  // ценой всей квартиры.
  if (
    text.includes("цена на кв.м") ||
    text.includes("price per") ||
    text.includes("price/m")
  ) {
    return "pricePerSqm";
  }

  if (
  text === "price" ||
  text === "price euro" ||
  text === "final price" ||
  text === "цена" ||
  text === "цена объекта" ||
  text === "цена/eur" ||
  text.startsWith("цена в") ||
  text.startsWith("цена,") ||
  text.startsWith("цена (") ||
  text.startsWith("цены (")
) {
  return "price";
}


  // ----------------------------------------
  // ТАКСА ПОДДЕРЖКИ
  // ----------------------------------------

  if (
    text === "maintenance" ||
    text === "annual fee" ||
    text === "tax" ||
    text === "такса" ||
    text.includes("такса поддержки")
  ) {
    return "maintenance";
  }


  // ----------------------------------------
  // МЕБЕЛЬ
  // ----------------------------------------

  if (
    text === "furniture" ||
    text === "furn" ||
    text === "мебель" ||
    text === "мебели" ||
    text === "обзавеждане"
  ) {
    return "furniture";
  }


  // ----------------------------------------
  // ВИД
  // ----------------------------------------

  if (
    text === "view" ||
    text === "вид" ||
    text === "гледка" ||
    text === "изложение" ||
    text.startsWith("вид на")
  ) {
    return "view";
  }


  // ----------------------------------------
  // КОМИССИЯ
  // ----------------------------------------

  if (
    text.includes("commission") ||
    text.includes("comission") ||
    text.includes("commi ion") ||
    text.includes("комиссия") ||
    text.includes("комисион") ||
    text.includes("комиссиони") ||
    text.includes("комиссия партнерам") ||
    text.includes("комиссия для агента") ||
    text.includes("partner fee")
  ) {
    return "commission";
  }


  // ----------------------------------------
  // РАССРОЧКА
  // ----------------------------------------

  if (
    text === "рассрочка" ||
    text.includes("рассроч")
  ) {
    return "installment";
  }


  // ----------------------------------------
  // ПЕРВЫЙ ВЗНОС
  // ----------------------------------------

  if (
    text.includes("первый взнос") ||
    text.includes("първа вноска") ||
    text.includes("first payment") ||
    text.includes("down payment")
  ) {
    return "firstPayment";
  }


  // ----------------------------------------
  // ФОТО
  // ----------------------------------------

  if (
    text === "photo" ||
    text === "photos" ||
    text === "фото" ||
    text === "снимки" ||
    text === "снимки" ||
    text.includes("foto in google disk") ||
    text.includes("ссылка на фото")
  ) {
    return "photo";
  }


  // ----------------------------------------
  // ССЫЛКА НА ОБЪЕКТ
  // ----------------------------------------

  if (
    text === "link" ||
    text === "web site" ||
    text === "alo.bg" ||
    text.includes("ссылка на объект")
  ) {
    return "listingUrl";
  }


  // ----------------------------------------
  // ПРИМЕЧАНИЯ / КОММЕНТАРИИ
  // ----------------------------------------

  if (
    text === "notes" ||
    text === "note" ||
    text === "comments" ||
    text === "comment" ||
    text === "info" ||
    text === "примечания" ||
    text === "примечание" ||
    text === "комментарий" ||
    text === "комментарии" ||
    text === "коментари" ||
    text === "забележка" ||
    text === "доп инф" ||
    text === "общее описание" ||
    text === "описание" ||
    text.includes("source / notes")
  ) {
    return "notes";
  }


  // ----------------------------------------
  // СТАТУС
  // ----------------------------------------

  if (
    text === "status" ||
    text === "статус" ||
    text === "статут"
  ) {
    return "status";
  }


  // ----------------------------------------
  // РАССТОЯНИЕ ДО МОРЯ
  // ----------------------------------------

  if (
    text === "to sea" ||
    text.includes("до моря")
  ) {
    return "distanceToSea";
  }


  // ----------------------------------------
  // КОНТАКТ
  // ----------------------------------------

  if (
    text.includes("контакт") ||
    text === "contact" ||
    text === "manager" ||
    text === "ответственный" ||
    text === "телефон"
  ) {
    return "contact";
  }


  return null;
}


// ==========================================
// ЧИСЛА
// ==========================================

function cleanNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let text = String(value)
    .replace(/\u00A0/g, " ")
    .trim();

  if (!text) return null;

  const matches =
    text.match(/\d[\d\s.,]*/);

  if (!matches) return null;

  let number = matches[0]
    .replace(/\s/g, "");

  // 56.000 / 56,000 -> 56000
  if (
    /^\d{1,3}[.,]\d{3}$/.test(number)
  ) {
    number =
      number.replace(/[.,]/g, "");
  } else {
    number =
      number.replace(",", ".");
  }

  const result = Number(number);

  return Number.isNaN(result)
    ? null
    : result;
}


// ==========================================
// НОРМАЛИЗАЦИЯ ТИПА КВАРТИРЫ
// ==========================================

function normalizePropertyType(value) {
  if (!value && value !== 0) {
    return null;
  }

  const original =
    String(value).trim();

  const text =
    original.toLowerCase();


  if (
    text.includes("studio") ||
    text.includes("студи") ||
    text === "0"
  ) {
    return "studio";
  }


  if (
    text === "1 bedroom" ||
    text === "1-bedroom" ||
    text === "1+1" ||
    text.includes("1 спаль")
  ) {
    return "1-bedroom";
  }


  if (
    text === "2 bedroom" ||
    text === "2-bedroom" ||
    text === "2+1" ||
    text.includes("2 спаль")
  ) {
    return "2-bedroom";
  }


  if (
    text === "3 bedroom" ||
    text === "3-bedroom" ||
    text === "3+1" ||
    text.includes("3 спаль")
  ) {
    return "3-bedroom";
  }


  return original;
}


// ==========================================
// СОЗДАЁМ КАРТУ КОЛОНОК
// ==========================================

function createColumnMap(headers) {
  const map = {};

  headers.forEach((header, index) => {
    const field =
      recognizeColumn(header);

    if (!field) return;

    // Если одинаковое поле встретилось дважды,
    // оставляем первое.
    if (
      Object.values(map)
        .includes(field)
    ) {
      return;
    }

    map[index] = field;
  });

  return map;
}


// ==========================================
// НОРМАЛИЗУЕМ ОДНУ СТРОКУ
// ==========================================

function normalizeRow(
  row,
  columnMap,
  metadata = {}
) {
  const apartment = {
    ...metadata
  };


  Object.entries(columnMap)
    .forEach(([index, field]) => {

      apartment[field] =
        row[Number(index)] ?? null;

    });


  if ("price" in apartment) {
    apartment.price =
      cleanNumber(apartment.price);
  }


  if ("pricePerSqm" in apartment) {
    apartment.pricePerSqm =
      cleanNumber(
        apartment.pricePerSqm
      );
  }


  if ("area" in apartment) {
    apartment.area =
      cleanNumber(apartment.area);
  }


  if ("firstPayment" in apartment) {
    apartment.firstPayment =
      cleanNumber(
        apartment.firstPayment
      );
  }


  if ("type" in apartment) {
    apartment.typeRaw =
      apartment.type;

    apartment.type =
      normalizePropertyType(
        apartment.type
      );
  }


  return apartment;
}


// ==========================================
// ЭКСПОРТ
// ==========================================

module.exports = {
  normalizeText,
  recognizeColumn,
  cleanNumber,
  normalizePropertyType,
  createColumnMap,
  normalizeRow
};


// ==========================================
// ЕСЛИ ЗАПУСТИЛИ normalize.js НАПРЯМУЮ
// ПОКАЖЕМ НЕБОЛЬШОЙ ТЕСТ
// ==========================================

if (require.main === module) {

  const testHeaders = [
    "City",
    "Complex Name",
    "Bedroom",
    "Square m2",
    "Floor",
    "Price euro",
    "Maintenance",
    "Furniture",
    "View",
    "Рассрочка",
    "Первый взнос",
    "Photos"
  ];


  console.log(
    "\n🧠 ТЕСТ НОВОГО НОРМАЛИЗАТОРА\n"
  );


  testHeaders.forEach((header) => {

    console.log(
      `${header}  →  ${recognizeColumn(header)}`
    );

  });


  console.log(
    "\n✅ normalize.js готов.\n"
  );
}
