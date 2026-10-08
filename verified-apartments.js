
const apartments = require("./all-apartments.json");
const priceOverrides = require("./price-overrides.json");

function sameText(a, b) {
  return String(a ?? "").trim().toLowerCase() ===
    String(b ?? "").trim().toLowerCase();
}

function verifyApartment(apartment) {
  const match = String(apartment.sourceUrl || "").match(
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
  );

  const spreadsheetId = match ? match[1] : "";

  const key = [
    spreadsheetId,
    apartment.sourceSheet,
    apartment.sourceRow
  ].join("|");

  const correction = priceOverrides[key];

  if (!correction) {
    return {
      ...apartment,
      priceVerified: false,
      priceStatus: "source"
    };
  }

  const matches =
    sameText(apartment.agency, correction.agency) &&
    sameText(apartment.complex, correction.complex) &&
    sameText(apartment.type, correction.type) &&
    Number(apartment.area) === Number(correction.area) &&
    Number(apartment.price) === Number(correction.originalPrice);

  if (!matches) {
    return {
      ...apartment,
      priceVerified: false,
      priceStatus: "review_required"
    };
  }

  return {
    ...apartment,
    originalPrice: apartment.price,
    price: correction.price,
    priceVerified: true,
    priceStatus: "broker_verified"
  };
}

const verifiedApartments = apartments.map(verifyApartment);

module.exports = {
  verifyApartment,
  verifiedApartments
};
