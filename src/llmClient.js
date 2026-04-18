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
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;
const TIMEOUT_TEMP_BUMP = 0.1;

const client = new OpenAI();

function llmError(type, message, extra = {}) {
  return Object.assign(new Error(message), { type, ...extra });
}

async function call({ model, messages, schema, timeoutMs = DEFAULT_TIMEOUT_MS, temperature = 0, _attempt = 0 }) {
  try {
    const request = client.chat.completions.parse({
      model,
      messages,
      temperature,
      response_format: zodResponseFormat(schema, "response"),
    });

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(llmError("timeout", "LLM request timed out")), timeoutMs)
    );

    const response = await Promise.race([request, timeout]);
    const message = response.choices[0].message;

    if (message.refusal) {
      throw llmError("model_refusal", "Model refused to answer", { refusal: message.refusal });
    }

    if (!message.parsed) {
      throw llmError("malformed_output", "Model returned unparseable output");
    }

    return { parsed: message.parsed, raw: message.content };

  } catch (err) {
    if (err.type === "timeout" && _attempt < MAX_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, _attempt)));
      // Low-temperature models can get stuck generating repeated tokens indefinitely.
      // A small temperature increase on each timeout retry breaks this pattern
      // without meaningfully degrading structured output quality.
      return call({ model, messages, schema, timeoutMs, temperature: temperature + TIMEOUT_TEMP_BUMP, _attempt: _attempt + 1 });
    }
    throw err;
  }
}

const llm = {
  small: (args) => call({ ...args, model: MODELS.small }),
  large: (args) => call({ ...args, model: MODELS.large }),
};

module.exports = llm;
