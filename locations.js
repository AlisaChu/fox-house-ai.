
function normalizeLocation(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Святой Влас
  if (
    /святой\s*влас|свети\s*влас|св\s*влас|sveti\s*vlas|svety\s*vlas|saint\s*vlas/i.test(text)
  ) {
    return "sveti_vlas";
  }

  // Солнечный Берег
  if (
    /солнечн\w*\s*берег|слънчев\s*бряг|sunny\s*beach/i.test(text)
  ) {
    return "sunny_beach";
  }

  // Несебр
  if (
    /несеб[ъе]р|nesebar|nessebar/i.test(text)
  ) {
    return "nesebar";
  }

  // Равда
  if (/равда|ravda/i.test(text)) {
    return "ravda";
  }

  // Бургас
  if (/бургас|burgas/i.test(text)) {
    return "burgas";
  }

  // Остальные названия пока оставляем как есть
  return text;
}

module.exports = {
  normalizeLocation
};
