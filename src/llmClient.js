require("dotenv").config();
const OpenAI = require("openai");
const { zodResponseFormat } = require("openai/helpers/zod");

// These models are proxies for what would be used in production.
// small → a fast, cheap local/open-source model sufficient for simple classification tasks
// large → a capable frontier model for nuanced schema extraction and reasoning
const MODELS = {
  small: "gpt-4o-mini",
  large: "gpt-4o",
};

const DEFAULT_TIMEOUT_MS = 10000;

const client = new OpenAI();

async function call({ model, messages, schema, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const request = client.beta.chat.completions.parse({
    model,
    messages,
    response_format: zodResponseFormat(schema, "response"),
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("LLM request timed out")), timeoutMs)
  );

  const response = await Promise.race([request, timeout]);
  const parsed = response.choices[0].message.parsed;

  if (!parsed) throw new Error("Malformed model output: no parsed response");

  return parsed;
}

const llm = {
  small: (args) => call({ ...args, model: MODELS.small }),
  large: (args) => call({ ...args, model: MODELS.large }),
};

module.exports = llm;
