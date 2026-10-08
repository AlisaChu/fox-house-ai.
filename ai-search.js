"use strict";

const { normalizeLocation } = require("./locations");

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3:4b";

// ==========================================
// ЗАГРУЗКА БАЗЫ
// ==========================================

function getVerifiedApartments() {
  const databasePath = require.resolve("./all-apartments.json");
  const verifiedPath = require.resolve("./verified-apartments");

  delete require.cache[databasePath];
  delete require.cache[verifiedPath];

  const { verifiedApartments } = require("./verified-apartments");

  return verifiedApartments;
}

// ==========================================
// ОБЩИЕ ФУНКЦИИ
// ==========================================

function clean(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let text = String(value)
    .replace(/[\s\u00a0]/g, "")
    .replace(/[€]/g, "");

  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, "");
  } else {
    text = text.replace(",", ".");
  }

  const result = Number(text);

  return Number.isFinite(result) && result >= 0
    ? result
    : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validType(value) {
  const types = [
    "studio",
    "1-bedroom",
    "2-bedroom",
    "3-bedroom",
    "4-bedroom"
  ];

  return types.includes(value) ? value : null;
}

// ==========================================
// ГОРОДА
// ==========================================

const CITIES = [
  {
    name: "Святой Влас",
    patterns: [
      /свят(?:ой|ого|ом)?\s*влас(?:е|а)?/u,
      /св\.?\s*влас/u,
      /свети\s*влас/u,
      /sveti\s*vlas/u,
      /st\.?\s*vlas/u
    ]
  },
  {
    name: "Солнечный Берег",
    patterns: [
      /солнечн(?:ый|ом|ого)?\s*берег(?:е|а)?/u,
      /слънчев\s*бряг/u,
      /sunny\s*beach/u
    ]
  },
  {
    name: "Несебр",
    patterns: [
      /несеб(?:р|ре|ра)/u,
      /nessebar/u,
      /nesebar/u
    ]
  },
  {
    name: "Равда",
    patterns: [
      /равд(?:а|е|у|ы)/u,
      /ravda/u
    ]
  },
  {
    name: "Елените",
    patterns: [
      /елените/u,
      /elenite/u
    ]
  },
  {
    name: "Бургас",
    patterns: [
      /бургас/u,
      /burgas/u
    ]
  },
  {
    name: "Поморие",
    patterns: [
      /помори/u,
      /pomorie/u
    ]
  },
  {
    name: "Ахелой",
    patterns: [
      /ахелой/u,
      /aheloy/u
    ]
  },
  {
    name: "Обзор",
    patterns: [
      /обзор/u,
      /obzor/u
    ]
  },
  {
    name: "Созополь",
    patterns: [
      /созопол/u,
      /sozopol/u
    ]
  },
  {
    name: "Варна",
    patterns: [
      /варн/u,
      /varna/u
    ]
  },
  {
    name: "Кошарица",
    patterns: [
      /кошариц/u,
      /kosharitsa/u
    ]
  },
  {
    name: "Тынково",
    patterns: [
      /тынков/u,
      /тънково/u,
      /tynkovo/u
    ]
  }
];

function canonicalCity(value) {
  const text = clean(value);

  if (!text) return "";

  for (const city of CITIES) {
    if (city.patterns.some(pattern => pattern.test(text))) {
      return city.name;
    }
  }

  return clean(normalizeLocation(value));
}

function detectCities(message) {
  const text = clean(message);

  return unique(
    CITIES
      .filter(city =>
        city.patterns.some(pattern => pattern.test(text))
      )
      .map(city => city.name)
  );
}

// ==========================================
// ДЕНЕЖНЫЕ СУММЫ
// ==========================================

function parseAmount(raw, suffix = "") {
  if (!raw) return null;

  let text = String(raw).replace(/\s/g, "");

  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, "");
  } else {
    text = text.replace(",", ".");
  }

  let result = Number(text);

  if (!Number.isFinite(result)) return null;

  const unit = clean(suffix);

  if (/^(тыс|к|k)/u.test(unit)) {
    result *= 1000;
  }

  if (/^(млн|million)/u.test(unit)) {
    result *= 1000000;
  }

  return result;
}

const MONEY_NUMBER =
  "(\\d{1,3}(?:[\\s.,]\\d{3})+|\\d+(?:[.,]\\d+)?)";

const MONEY_SUFFIX =
  "(?:\\s*(тыс(?:яч)?\\.?|к|k|млн\\.?|million))?";

const MONEY_CURRENCY =
  "(?:\\s*(?:€|евро|eur))?";

const MONEY_PATTERN =
  MONEY_NUMBER + MONEY_SUFFIX + MONEY_CURRENCY;

function findAmounts(message) {
  const regex = new RegExp(MONEY_PATTERN, "giu");
  const results = [];

  for (const match of message.matchAll(regex)) {
    const value = parseAmount(match[1], match[2]);

    if (value !== null) {
      results.push({
        value,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
    }
  }

  return results;
}

// ==========================================
// ЦЕНА: ОТ, ДО, ДОРОЖЕ, ДЕШЕВЛЕ
// ==========================================

function extractPriceRange(message) {
  const text = clean(message);

  let minPrice = null;
  let maxPrice = null;
  let minExclusive = false;
  let maxExclusive = false;

  const rangePattern = new RegExp(
    "(?:от|между)\\s*" +
    MONEY_PATTERN +
    "\\s*(?:до|и)\\s*" +
    MONEY_PATTERN,
    "iu"
  );

  const range = text.match(rangePattern);

  if (range) {
    const a = parseAmount(range[1], range[2]);
    const b = parseAmount(range[3], range[4]);

    if (a !== null && b !== null) {
      return {
        minPrice: Math.min(a, b),
        maxPrice: Math.max(a, b),
        minExclusive: false,
        maxExclusive: false
      };
    }
  }

  const amounts = findAmounts(text);

  for (const item of amounts) {
    const after = text.slice(item.end, item.end + 15);

    // Не принимаем площадь за цену.
    if (/^\s*(?:м²|м2|кв\.?\s*м)/u.test(after)) {
      continue;
    }

    // Не принимаем этаж за цену.
    if (/^\s*(?:этаж|этаже|этажей)/u.test(after)) {
      continue;
    }

    const hasMoneyMarker =
      /евро|€|eur|тыс|млн|million/u.test(item.text);

    if (item.value < 1000 && !hasMoneyMarker) {
      continue;
    }

    const before = text.slice(
      Math.max(0, item.start - 45),
      item.start
    );

    if (
      /(?:не\s+дороже|не\s+выше|не\s+более|максимум|дешевле|менее|ниже|до)\s*$/u.test(before)
    ) {
      maxPrice = item.value;
      maxExclusive = /(?:дешевле|менее|ниже)\s*$/u.test(before);
      continue;
    }

    if (
      /(?:не\s+дешевле|не\s+ниже|не\s+менее|минимум|дороже|свыше|более|выше|от|начиная\s+с)\s*$/u.test(before)
    ) {
      minPrice = item.value;
      minExclusive = /(?:дороже|свыше|более|выше)\s*$/u.test(before);
      continue;
    }

    if (/(?:ровно|точно)\s*$/u.test(before)) {
      minPrice = item.value;
      maxPrice = item.value;
      continue;
    }

    if (
      /(?:бюджет|стоимость|цена|за)\s*$/u.test(before)
    ) {
      maxPrice = item.value;
      continue;
    }

    // Единственная сумма без явного сравнения —
    // предполагаемый максимальный бюджет.
    if (
      amounts.length === 1 &&
      minPrice === null &&
      maxPrice === null
    ) {
      maxPrice = item.value;
    }
  }

  return {
    minPrice,
    maxPrice,
    minExclusive,
    maxExclusive
  };
}

// ==========================================
// ПЛОЩАДЬ
// ==========================================

function extractAreaRange(message) {
  const text = clean(message);

  let minArea = null;
  let maxArea = null;

  const unit =
    "(?:м²|м2|кв\\.?\\s*м(?:етр(?:ов|а)?)?)";

  const range = text.match(
    new RegExp(
      "(?:от|между)\\s*" +
      "(\\d+(?:[.,]\\d+)?)\\s*" +
      "(?:до|и)\\s*" +
      "(\\d+(?:[.,]\\d+)?)\\s*" +
      unit,
      "u"
    )
  );

  if (range) {
    const a = Number(range[1].replace(",", "."));
    const b = Number(range[2].replace(",", "."));

    return {
      minArea: Math.min(a, b),
      maxArea: Math.max(a, b)
    };
  }

  const pattern = new RegExp(
    "(от|более|больше|не менее|минимум|до|менее|меньше|не более|максимум)" +
    "\\s*(\\d+(?:[.,]\\d+)?)\\s*" +
    unit,
    "gu"
  );

  for (const match of text.matchAll(pattern)) {
    const value = Number(match[2].replace(",", "."));

    if (
      /^(от|более|больше|не менее|минимум)$/u.test(match[1])
    ) {
      minArea = value;
    } else {
      maxArea = value;
    }
  }

  return { minArea, maxArea };
}

// ==========================================
// ТИП КВАРТИРЫ
// ==========================================

function detectType(message) {
  const text = clean(message);

  if (/студи|studio/u.test(text)) {
    return "studio";
  }

  if (
    /двухкомнатн|2[\s-]*комнатн|двушк|одн[а-я -]*спальн|1-bedroom|1\s*\+\s*1/u.test(text)
  ) {
    return "1-bedroom";
  }

  if (
    /трехкомнатн|3[\s-]*комнатн|трешк|две спальни|двумя спальнями|2-bedroom|2\s*\+\s*1/u.test(text)
  ) {
    return "2-bedroom";
  }

  if (
    /четырехкомнатн|4[\s-]*комнатн|три спальни|3-bedroom|3\s*\+\s*1/u.test(text)
  ) {
    return "3-bedroom";
  }

  if (
    /пятикомнатн|5[\s-]*комнатн|четыре спальни|4-bedroom|4\s*\+\s*1/u.test(text)
  ) {
    return "4-bedroom";
  }

  return null;
}

// ==========================================
// КАТЕГОРИЯ НЕДВИЖИМОСТИ
// ==========================================

function detectCategory(message) {
  const text = clean(message);

  if (
    /парковк|паркомест|гараж|parking|garage/u.test(text)
  ) {
    return "parking";
  }

  if (
    /участ|земл|парц[еe]л|land|plot/u.test(text)
  ) {
    return "land";
  }

  if (
    /дом(?:а|ов|ик)?\b|вилл|коттедж|таунхаус|house|villa/u.test(text)
  ) {
    return "house";
  }

  if (
    /магазин|офис|коммерческ|торгов|shop|office/u.test(text)
  ) {
    return "commercial";
  }

  return "apartment";
}

function classifyApartment(apartment) {
  const explicit = clean([
    apartment.propertyType,
    apartment.category,
    apartment.typeRaw,
    apartment.type
  ].join(" "));

  const name = clean(apartment.complex);

  const combined = explicit + " " + name;

  if (
    /парковк|паркомест|гараж|parking|garage/u.test(combined)
  ) {
    return "parking";
  }

  if (
    /участ|земл|парц[еe]л|land|plot/u.test(combined)
  ) {
    return "land";
  }

  if (
    /магазин|офис|коммерческ|торгов|shop|office/u.test(explicit)
  ) {
    return "commercial";
  }

  // Не считаем квартиру домом только потому,
  // что название комплекса содержит Villa.
  if (
    /(?:^|[\s,;])(?:дом|house|villa|вилла|коттедж|таунхаус)(?:$|[\s,;])/u.test(explicit)
  ) {
    return "house";
  }

  return "apartment";
}

// ==========================================
// ЭТАЖ
// ==========================================

function getFloor(value) {
  const text = clean(value);

  if (!text) return null;

  if (
    /партер|ground|приземен|приземный/u.test(text)
  ) {
    return 0;
  }

  const match = text.match(/\d{1,2}/u);

  return match ? Number(match[0]) : null;
}

function extractFloor(message) {
  const text = clean(message);

  if (
    /не на первом этаже|выше первого этажа/u.test(text)
  ) {
    return {
      minFloor: 2,
      maxFloor: null
    };
  }

  const minMatch = text.match(
    /(?:от|с|не ниже)\s*(\d{1,2})\s*(?:-?го)?\s*этаж/u
  );

  const maxMatch = text.match(
    /(?:до|не выше)\s*(\d{1,2})\s*(?:-?го)?\s*этаж/u
  );

  return {
    minFloor: minMatch ? Number(minMatch[1]) : null,
    maxFloor: maxMatch ? Number(maxMatch[1]) : null
  };
}

// ==========================================
// АНАЛИЗ ЗАПРОСА ЧЕРЕЗ OLLAMA
// ==========================================

async function askOllama(message) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    30000
  );

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: `Ты извлекаешь параметры поиска недвижимости.

Верни только JSON:

{
  "city": null,
  "cities": [],
  "complex": null,
  "type": null,
  "minPrice": null,
  "maxPrice": null,
  "minArea": null,
  "maxArea": null
}

Правила:
- Не придумывай условия.
- Двухкомнатная = 1-bedroom.
- Трехкомнатная = 2-bedroom.
- Студия = studio.
- "дороже 120000" = minPrice 120000.
- "дешевле 120000" = maxPrice 120000.
- "от 80000 до 120000" = обе границы.
- complex — только явно названный жилой комплекс.
- cities — массив явно названных городов.
- Верни только JSON.`
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();

    const content = String(
      data.message?.content || "{}"
    )
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    const parsed = JSON.parse(content);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } finally {
    clearTimeout(timeout);
  }
}

// ==========================================
// ПОНИМАНИЕ ЗАПРОСА
// ==========================================

async function understandRequest(message) {
  const text = clean(message);

  const prices = extractPriceRange(message);
  const areas = extractAreaRange(message);
  const floors = extractFloor(message);

  const detectedCities = detectCities(message);
  const detectedType = detectType(message);
  const category = detectCategory(message);

  let ai = {};

  try {
    ai = await askOllama(message);
  } catch (error) {
    console.warn(
      "Ollama недоступна. Используются локальные правила:",
      error.message
    );
  }

  const aiCities = Array.isArray(ai.cities)
    ? ai.cities
    : ai.city
      ? [ai.city]
      : [];

  const cities = detectedCities.length
    ? detectedCities
    : unique(
        aiCities
          .filter(city => typeof city === "string")
          .map(canonicalCity)
      );

  const hasPriceLanguage =
    /евро|€|eur|цен|бюджет|дороже|дешевле|свыше|стоимост/u.test(text);

  const hasAreaLanguage =
    /площад|м²|м2|кв\.?\s*м/u.test(text);

  let minPrice = prices.minPrice;
  let maxPrice = prices.maxPrice;

  const priceWasParsed =
    minPrice !== null ||
    maxPrice !== null;

  if (!priceWasParsed && hasPriceLanguage) {
    minPrice = toNumber(ai.minPrice);
    maxPrice = toNumber(ai.maxPrice);
  }

  let minArea = areas.minArea;
  let maxArea = areas.maxArea;

  if (
    minArea === null &&
    maxArea === null &&
    hasAreaLanguage
  ) {
    minArea = toNumber(ai.minArea);
    maxArea = toNumber(ai.maxArea);
  }

  return {
    city: cities[0] || null,
    cities,

    complex:
      typeof ai.complex === "string" &&
      ai.complex.trim()
        ? ai.complex.trim()
        : null,

    minPrice,
    maxPrice,

    minExclusive: prices.minExclusive,
    maxExclusive: prices.maxExclusive,

    minArea,
    maxArea,

    type: detectedType || validType(ai.type),
    category,

    minFloor: floors.minFloor,
    maxFloor: floors.maxFloor
  };
}

// ==========================================
// ПОИСК КВАРТИР
// ==========================================

function searchApartments(filters = {}) {
  const requestedCities = (
    Array.isArray(filters.cities) &&
    filters.cities.length
      ? filters.cities
      : filters.city
        ? [filters.city]
        : []
  ).map(canonicalCity);

  const minPrice = toNumber(filters.minPrice);
  const maxPrice = toNumber(filters.maxPrice);

  const minArea = toNumber(filters.minArea);
  const maxArea = toNumber(filters.maxArea);

  const minFloor = toNumber(filters.minFloor);
  const maxFloor = toNumber(filters.maxFloor);

  const category = filters.category || "apartment";
  const requestedType = validType(filters.type);
  const requestedComplex = clean(filters.complex);

  if (
    minPrice !== null &&
    maxPrice !== null &&
    minPrice > maxPrice
  ) {
    return [];
  }

  if (
    minArea !== null &&
    maxArea !== null &&
    minArea > maxArea
  ) {
    return [];
  }

  return getVerifiedApartments()
  .filter(apartment => {

    // Не показываем недоступные квартиры
    const status = String(apartment.status || "")
      .trim()
      .toLowerCase();

    if (
      /^(unavailable|deposit|deposit pending|sold|reserved)$/.test(status)
    ) {
      return false;
    }

    // У Nils информация о депозите бывает в комментариях
    const agency = String(apartment.agency || "")
      .trim()
      .toLowerCase();

    const notes = String(apartment.notes || "")
      .trim()
      .toLowerCase();

    if (
      agency === "nils" &&
      /^(deposit|deposit pending)$/.test(notes)
    ) {
      return false;
    }

    const price = toNumber(apartment.price);
    const area = toNumber(apartment.area);

      if (price === null || price <= 0) {
        return false;
      }

      if (
        apartment.priceStatus === "review_required"
      ) {
        return false;
      }

      if (
        apartment.type === "1-bedroom" &&
        price < 30000 &&
        apartment.priceStatus !== "broker_verified"
      ) {
        return false;
      }

      // Категория
      if (
        classifyApartment(apartment) !== category
      ) {
        return false;
      }

      // Город
      if (requestedCities.length) {
        const actualCity = canonicalCity(
          apartment.location
        );

        if (!requestedCities.includes(actualCity)) {
          return false;
        }
      }

      // Тип квартиры
      if (
        requestedType &&
        apartment.type !== requestedType
      ) {
        return false;
      }

      // Минимальная цена
      if (minPrice !== null) {
        if (filters.minExclusive) {
          if (price <= minPrice) return false;
        } else {
          if (price < minPrice) return false;
        }
      }

      // Максимальная цена
      if (maxPrice !== null) {
        if (filters.maxExclusive) {
          if (price >= maxPrice) return false;
        } else {
          if (price > maxPrice) return false;
        }
      }

      // Минимальная площадь
      if (minArea !== null) {
        if (
          area === null ||
          area < minArea
        ) {
          return false;
        }
      }

      // Максимальная площадь
      if (maxArea !== null) {
        if (
          area === null ||
          area > maxArea
        ) {
          return false;
        }
      }

      // Название комплекса
      if (requestedComplex) {
        const actualComplex = clean([
          apartment.complex,
          apartment.project,
          apartment.building,
          apartment.name
        ].join(" "));

        if (
          !actualComplex.includes(requestedComplex)
        ) {
          return false;
        }
      }

      // Этаж
      if (
        minFloor !== null ||
        maxFloor !== null
      ) {
        const floor = getFloor(apartment.floor);

        if (floor === null) {
          return false;
        }

        if (
          minFloor !== null &&
          floor < minFloor
        ) {
          return false;
        }

        if (
          maxFloor !== null &&
          floor > maxFloor
        ) {
          return false;
        }
      }

      return true;
    })
    .sort(
      (a, b) =>
        Number(a.price) - Number(b.price)
    );
}

module.exports = {
  understandRequest,
  searchApartments
};
