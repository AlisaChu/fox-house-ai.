const readline = require("readline");

async function main() {
  const { Ollama } = await import("ollama");

  const ollama = new Ollama({
    host: "http://127.0.0.1:11434",
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🤖 AI-агент запущен!");
  console.log("Напиши свой вопрос. Для выхода напиши: выход\n");

  function askQuestion() {
    rl.question("Ты: ", async (question) => {
      if (question.toLowerCase() === "выход") {
        rl.close();
        return;
      }

      try {
        const response = await ollama.chat({
          model: "qwen3:4b",
          messages: [
            {
              role: "user",
              content: question,
            },
          ],
        });

        console.log("\nAI:", response.message.content);
        console.log();

        askQuestion();
      } catch (error) {
        console.log("Ошибка:", error.message);
        askQuestion();
      }
    });
  }

  askQuestion();
}

main();
