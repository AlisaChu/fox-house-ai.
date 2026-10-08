
const serviceNames = new Set([
  "комплекс",
  "complex name",
  "www.eurometr.com"
]);

const blockedStatuses = new Set([
  "unavailable",
  "deposit",
  "deposit pending",
  "sold",
  "reserved"
]);

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isServiceRow(apartment) {
  const complex = normalized(apartment.complex);
  const id = normalized(apartment.id);

  if (serviceNames.has(complex)) {
    return true;
  }

  // Повторные заголовки таблиц
  if (id === "id") {
    return true;
  }

  return false;
}

function isUnavailable(apartment) {
  const status = normalized(apartment.status);
  const agency = normalized(apartment.agency);
  const id = normalized(apartment.id);
  const notes = normalized(apartment.notes);

  if (blockedStatuses.has(status)) {
    return true;
  }

  // У Festival статус иногда записан в ID
  if (
    agency === "festival" &&
    blockedStatuses.has(id)
  ) {
    return true;
  }

  // У Nils депозит может быть указан в комментариях
  if (
    agency === "nils" &&
    (
      notes.includes("deposit pending") ||
      notes.includes("deposit")
    )
  ) {
    return true;
  }

  return false;
}

function isFestival(apartment) {
  return normalized(apartment.agency) === "festival";
}

function sameFestivalApartment(a, b) {
  if (normalized(a.id) !== normalized(b.id)) {
    return false;
  }

  if (Number(a.price) !== Number(b.price)) {
    return false;
  }

  if (normalized(a.floor) !== normalized(b.floor)) {
    return false;
  }

  const areaA = Number(a.area);
  const areaB = Number(b.area);

  if (
    !Number.isFinite(areaA) ||
    !Number.isFinite(areaB) ||
    areaA <= 0 ||
    areaB <= 0
  ) {
    return false;
  }

  // Допускаем разницу округления площади до 1 м²
  return Math.abs(areaA - areaB) <= 1;
}

function cleanApartments(apartments) {
  // 1. Удаляем служебные и недоступные записи
  const valid = apartments.filter(
    apartment =>
      !isServiceRow(apartment) &&
      !isUnavailable(apartment)
  );

  const removedInvalid = apartments.length - valid.length;

  // 2. Собираем английские записи Festival
  const festivalEnglish = valid.filter(
    apartment =>
      isFestival(apartment) &&
      normalized(apartment.sourceSheet) === "english"
  );

  // 3. Убираем русскую запись, если есть
  // соответствующая английская
  let removedFestivalDuplicates = 0;

  const cleaned = valid.filter(apartment => {
    if (!isFestival(apartment)) {
      return true;
    }

    if (normalized(apartment.sourceSheet) !== "лист1") {
      return true;
    }

    const duplicate = festivalEnglish.some(english =>
      sameFestivalApartment(apartment, english)
    );

    if (duplicate) {
      removedFestivalDuplicates++;
      return false;
    }

    return true;
  });

  console.log(
    `🧹 Удалено служебных и недоступных записей: ${removedInvalid}`
  );

  console.log(
    `🔁 Удалено дублей Festival: ${removedFestivalDuplicates}`
  );

  console.log(
    `🏠 Осталось после очистки: ${cleaned.length}`
  );

  return cleaned;
}

module.exports = {
  isServiceRow,
  isUnavailable,
  cleanApartments
};
