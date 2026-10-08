
const readline = require("node:readline/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  understandRequest,
  searchApartments
} = require("./ai-search");

const execFileAsync = promisify(execFile);

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3:4b";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ==========================================
// 1. ОБНОВЛЕНИЕ БАЗЫ
// ==========================================

async function updateDatabase() {
  console.log(
    "\n🔄 Обновляю базу квартир из Google Sheets...\n"
  );

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["all-objects.js"],
    {
      cwd: __dirname,
      maxBuffer: 20 * 1024 * 1024
    }
  );

  if (stdout) {
    console.log(stdout);
  }

  if (stderr) {
    console.error(stderr);
  }

  console.log("✅ Обновление завершено.\n");
}

// ==========================================
// 2. ОБЩЕНИЕ С НЕЙРОСЕТЬЮ
// ==========================================

async function askAI(message) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      messages: [
        {
          role: "system",
          content: `
Ты личный ИИ-помощник риелтора в Болгарии.

Правила:
1. Отвечай на русском языке.
2. Пиши понятно, кратко и профессионально.
3. Помогай с вопросами о недвижимости.
4. Не придумывай квартиры, цены, площади,
   наличие объектов и другие характеристики.
5. Не утверждай, что проверил актуальные
   предложения, если поиск не выполнялся.
6. Для поиска недвижимости используется
   отдельная локальная база.
7. Если информации недостаточно,
   прямо сообщи об этом.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(
      `Ошибка Ollama: ${response.status}`
    );
  }

  const data = await response.json();

  return String(data.message?.content || "Нет ответа")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^[\s\S]*?<\/think>/, "")
    .trim();
}

// ==========================================
// 3. РАСПОЗНАВАНИЕ КОМАНДЫ ОБНОВЛЕНИЯ
// ==========================================

function isUpdateRequest(message) {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");

  const commands = [
    "обнови базу",
    "обновить базу",
    "обнови базу квартир",
    "обновить базу квартир",
    "обнови прайсы",
    "обновить прайсы"
  ];

  return commands.includes(text);
}

// ==========================================
// 4. РАСПОЗНАВАНИЕ ПОИСКА КВАРТИР
// ==========================================

function isSearchRequest(message) {
  const text = message.toLowerCase();

  const searchWords = [
    "найди",
    "подбери",
    "покажи квартиры",
    "покажи апартаменты",
    "подборку квартир",
    "подборку недвижимости",
    "ищу квартиру",
    "ищу апартамент",
    "нужна квартира",
    "нужен апартамент",
    "найти квартиру",
    "найти апартамент"
  ];

  return searchWords.some(word =>
    text.includes(word)
  );
}

// ==========================================
// 5. ПРЯМАЯ ССЫЛКА НА КВАРТИРУ
// ==========================================

function getApartmentLink(apartment) {
  const url = apartment.sourceUrl;

  if (!url) {
    return "Ссылка отсутствует";
  }

  const gid = apartment.sourceGid;
  const row = Number(apartment.sourceRow);

  if (
    gid == null ||
    !Number.isInteger(Number(gid)) ||
    Number(gid) < 0 ||
    !Number.isInteger(row) ||
    row < 1
  ) {
    return url;
  }

  try {
    const link = new URL(url);

    if (link.hostname !== "docs.google.com") {
      return url;
    }

    if (!link.pathname.includes("/spreadsheets/d/")) {
      return url;
    }

    link.search = "";
    link.hash = `gid=${gid}&range=A${row}`;

    return link.toString();
  } catch {
    return url;
  }
}

// ==========================================
// 6. ВЫВОД ОДНОЙ КВАРТИРЫ
// ==========================================

function printApartment(apartment, index) {
  const complex =
    apartment.complex || "Комплекс не указан";

  const location =
    apartment.location || "Город не указан";

  const agency =
    apartment.agency || "Агентство не указано";

  const price = Number(apartment.price);

  const area = Number(apartment.area);

  console.log(`\n${index + 1}. 🏠 ${complex}`);

  console.log(`📍 Город: ${location}`);

  console.log(
    `💶 Цена: ${price.toLocaleString("ru-RU")} €`
  );

  console.log(
    `📐 Площадь: ${
      Number.isFinite(area) && area > 0
        ? area + " м²"
        : "Не указана"
    }`
  );

  console.log(`🏢 Агентство: ${agency}`);

  if (apartment.priceStatus === "broker_verified") {
    console.log("✅ Цена подтверждена брокером");
  }

const photoValue = String(apartment.photo || "").trim();

const photoLinks = photoValue.match(/https?:\/\/[^\s,;]+/g) || [];

if (photoLinks.length > 0) {
  photoLinks.forEach((link) => {
    console.log(`📸 Фото: ${link}`);
  });
} else {
  console.log("📸 Ссылка на фото не указана");
}

if (apartment.listingUrl) {
  console.log(`🌐 Объявление: ${apartment.listingUrl}`);
}

  console.log(
    `🔗 Открыть квартиру: ${getApartmentLink(apartment)}`
  );

  console.log("----------------------------------");
}

// ==========================================
// 7. ПОИСК КВАРТИР
// ==========================================

async function handleSearch(message) {
  console.log("\n🔎 Анализирую запрос...\n");

  const filters = await understandRequest(message);

  console.log("📋 Параметры поиска:");
  console.log(filters);

  // searchApartments читает актуальный локальный JSON
  // через обновлённый ai-search.js.
  const results = searchApartments(filters);

  console.log(
    `\n🏠 Найдено объектов: ${results.length}`
  );

  if (results.length === 0) {
    console.log(
      "\nПо указанным параметрам квартиры не найдены."
    );

    console.log(
      "Попробуй увеличить бюджет или изменить условия.\n"
    );

    return;
  }

  const visibleResults = results.slice(0, 10);

  console.log(
    `\nПоказываю первые ${visibleResults.length} объектов:`
  );

  visibleResults.forEach((apartment, index) => {
    printApartment(apartment, index);
  });

  if (results.length > visibleResults.length) {
    console.log(
      `\nЕсть ещё ${
        results.length - visibleResults.length
      } объектов.`
    );
  }

  console.log(
    "\nℹ️ Наличие и цену уточняй у агентства."
  );

  console.log("");
}

// ==========================================
// 8. ГЛАВНЫЙ ЦИКЛ АГЕНТА
// ==========================================

async function main() {
  console.log("\n====================================");
  console.log("🏠 ЛИЧНЫЙ ИИ-АГЕНТ НЕДВИЖИМОСТИ");
  console.log("====================================");

  console.log("\nДоступные команды:");
  console.log("🔄 Обнови базу");
  console.log("🔎 Найди квартиру в Святом Власе до 90000 евро");
  console.log("💬 Любой вопрос к ИИ");
  console.log("🚪 Выход");

  console.log("\nАгент готов к работе.\n");

  try {
    while (true) {
      const question = await rl.question("Ты: ");

      const cleanQuestion = question.trim();

      if (!cleanQuestion) {
        continue;
      }

      const lowerQuestion = cleanQuestion.toLowerCase();

      if (
        lowerQuestion === "выход" ||
        lowerQuestion === "exit"
      ) {
        console.log("\n👋 До встречи!");
        break;
      }

      try {
        // Сначала проверяем обновление базы.
        // Эту команду нельзя передавать нейросети.
        if (isUpdateRequest(cleanQuestion)) {
          await updateDatabase();
          continue;
        }

        // Затем проверяем запрос на поиск.
        if (isSearchRequest(cleanQuestion)) {
          await handleSearch(cleanQuestion);
          continue;
        }

        // Все остальные сообщения идут в Qwen.
        console.log("\n🤖 Думаю...\n");

        const answer = await askAI(cleanQuestion);

        console.log(`🤖 Агент: ${answer}\n`);

      } catch (error) {
        console.error(
          "\n❌ Ошибка:",
          error.message,
          "\n"
        );
      }
    }
  } finally {
    rl.close();
  }
}

// ==========================================
// 9. ЗАПУСК
// ==========================================

main().catch(error => {
  console.error("❌ Критическая ошибка:", error);
  process.exitCode = 1;
});
