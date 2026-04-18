// ── state ─────────────────────────────────────────────
let scenarios = [];
let currentInput = null;
let customMode = false;
let jsonMode = false;
let authRequired = false;
let bootstrapped = false;

const CATEGORY_LABEL = {
  clear: "Clear",
  ambiguous: "Ambiguous",
  adversarial: "Adversarial",
  failure: "Failure",
  custom: "Custom",
};

// ── dom refs ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── api ───────────────────────────────────────────────
const fetchOpts = { credentials: "same-origin" };

function getDemoPasswordForRequest() {
  const el = $("#demo-password-bar");
  let p = (el?.value ?? "").trim();
  if (!p) {
    try {
      p = (sessionStorage.getItem("alfred_demo_pw") ?? "").trim();
    } catch (_) {
      /* ignore */
    }
    if (p && el) el.value = p;
  }
  return p;
}

function extraHeaders() {
  if (!authRequired) return {};
  const p = getDemoPasswordForRequest();
  return p ? { "X-Demo-Password": p } : {};
}

async function fetchScenarios() {
  const res = await fetch("/api/scenarios", {
    ...fetchOpts,
    headers: extraHeaders(),
  });
  if (res.status === 401) throw new Error("demo_auth_required");
  return res.json();
}

async function runDecision(body) {
  if (authRequired && !getDemoPasswordForRequest()) {
    const wrap = $("#demo-password-bar-wrap");
    wrap?.classList.remove("hidden");
    wrap?.classList.remove("is-retracted");
    const hint =
      "Demo key is missing. Enter the key from the email in the field at the top, then click Apply.";
    $("#demo-password-msg").textContent = hint;
    return {
      error: "demo_auth_required",
      outcome: "refuse",
      rationale: hint,
    };
  }

  const res = await fetch("/api/decide", {
    ...fetchOpts,
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      const wrap = $("#demo-password-bar-wrap");
      wrap?.classList.remove("is-retracted");
      const hasKey = Boolean(getDemoPasswordForRequest());
      const barMsg = hasKey
        ? data.message ??
          "That key was not accepted. Check the email, fix the field, then Apply again."
        : "Click Show details, enter the demo key from the email, then click Apply.";
      $("#demo-password-msg").textContent = barMsg;
      return {
        error: "demo_auth_required",
        outcome: "refuse",
        rationale:
          data.message ??
          (hasKey
            ? "The server rejected this demo key. Confirm it matches the email, then Apply again."
            : "No demo key was sent. Open Show details at the top, paste the key, Apply, then Run again."),
      };
    }
    if (res.status === 429) {
      return {
        error: "rate_limited",
        outcome: "refuse",
        rationale: data.message ?? "Too many requests. Try again in a bit.",
      };
    }
    return {
      error: `http_${res.status}`,
      outcome: "refuse",
      rationale: data.message ?? res.statusText ?? "Request failed.",
    };
  }
  return data;
}

// ── sidebar ───────────────────────────────────────────
function renderSidebar() {
  for (const category of ["clear", "ambiguous", "adversarial"]) {
    const container = $(`.scenario-list[data-category="${category}"]`);
    container.innerHTML = "";
    const items = scenarios.filter((s) => s.category === category);
    items.forEach((s, idx) => {
      const num = idx + 1;
      const btn = document.createElement("button");
      btn.dataset.scenarioId = s.id;
      btn.dataset.category = s.category;
      btn.dataset.number = String(num);
      btn.innerHTML = `
        <div class="btn-label">${CATEGORY_LABEL[s.category]} #${num}</div>
        <div class="btn-sublabel">${escapeHtml(s.label)}</div>
      `;
      btn.addEventListener("click", () => onScenarioClick(s));
      container.appendChild(btn);
    });
  }
}

function setActiveButton(id) {
  $$("#sidebar button").forEach((b) => b.classList.remove("active"));
  if (!id) return;
  const btn =
    $(`[data-scenario-id="${id}"]`) ??
    $(`[data-failure="${id}"]`) ??
    $(`[data-custom="${id}"]`);
  if (btn) btn.classList.add("active");
}

// ── explainer ─────────────────────────────────────────
function renderExplainer({ category, heading, title, explanation } = {}) {
  const el = $("#explainer");
  if (!category) {
    el.classList.add("hidden");
    el.removeAttribute("data-category");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.dataset.category = category;
  el.innerHTML = `
    <div class="category">${escapeHtml(heading)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(explanation)}</p>
  `;
}

function scenarioHeading(scenario) {
  const peers = scenarios.filter((s) => s.category === scenario.category);
  const num = peers.findIndex((s) => s.id === scenario.id) + 1;
  return `${CATEGORY_LABEL[scenario.category]} Scenario #${num}`;
}

// ── input view ────────────────────────────────────────
function renderInput(input) {
  // scenario mode: chat view / JSON editor
  const actionEl = $("#action-description");
  const convEl = $("#conversation");
  const jsonEl = $("#input-json");
  $("#custom-form")?.remove();

  const safe = input ?? { action_description: "", conversation_history: [] };

  actionEl.innerHTML = `<span class="label">Action</span>${escapeHtml(
    safe.action_description || "(empty)"
  )}`;

  convEl.innerHTML = "";
  for (const msg of safe.conversation_history ?? []) {
    const div = document.createElement("div");
    div.className = `msg ${msg.role === "user" ? "user" : "alfred"}`;
    div.innerHTML = `<div class="role">${escapeHtml(msg.role)}</div>${escapeHtml(
      msg.content
    )}`;
    convEl.appendChild(div);
  }

  jsonEl.value = JSON.stringify(safe, null, 2);
  jsonEl.readOnly = false;
  actionEl.hidden = jsonMode;
  convEl.hidden = jsonMode;
  jsonEl.hidden = !jsonMode;
  $("#toggle-edit").textContent = jsonMode ? "View as chat" : "Edit as JSON";
  $("#input-error").classList.add("hidden");
}

function renderCustomForm(input) {
  // custom mode: structured form with add/remove message rows
  const actionEl = $("#action-description");
  const convEl = $("#conversation");
  const jsonEl = $("#input-json");
  actionEl.hidden = true;
  convEl.hidden = true;

  $("#custom-form")?.remove();

  if (jsonMode) {
    // readonly JSON preview
    jsonEl.value = JSON.stringify(input, null, 2);
    jsonEl.readOnly = true;
    jsonEl.hidden = false;
    $("#toggle-edit").textContent = "Edit fields";
    return;
  }

  jsonEl.hidden = true;
  $("#toggle-edit").textContent = "View as JSON";

  const form = document.createElement("div");
  form.id = "custom-form";
  form.className = "custom-form";
  form.innerHTML = `
    <div class="custom-field">
      <label for="custom-action">Proposed action</label>
      <input type="text" id="custom-action" placeholder="e.g. Send an email to alice@acme.com about the renewal" value="${escapeAttr(input.action_description ?? "")}">
    </div>
    <div class="custom-field">
      <label>Conversation</label>
      <div id="custom-messages"></div>
      <button type="button" class="custom-add-msg">+ Add message</button>
    </div>
    <div class="custom-field">
      <label for="custom-trust">User trust level</label>
      <select id="custom-trust">
        <option value="established">established</option>
        <option value="new">new</option>
      </select>
    </div>
  `;
  $("#input-view").insertBefore(form, $("#input-error"));

  const trustSelect = form.querySelector("#custom-trust");
  trustSelect.value = input.user?.trust_level ?? "established";

  const messagesContainer = form.querySelector("#custom-messages");
  const startingMessages =
    input.conversation_history && input.conversation_history.length > 0
      ? input.conversation_history
      : [{ role: "user", content: "" }];
  for (const m of startingMessages) addCustomMessageRow(m);

  form.querySelector(".custom-add-msg").addEventListener("click", () => {
    addCustomMessageRow({ role: "user", content: "" });
    updateRemoveButtonsEnabled();
    const rows = messagesContainer.querySelectorAll(".custom-msg-row textarea");
    rows[rows.length - 1].focus();
  });

  updateRemoveButtonsEnabled();
  $("#input-error").classList.add("hidden");
}

function addCustomMessageRow({ role, content }) {
  const row = document.createElement("div");
  row.className = "custom-msg-row";
  row.innerHTML = `
    <select>
      <option value="user">user</option>
      <option value="alfred">alfred</option>
    </select>
    <textarea placeholder="Message content…"></textarea>
    <button type="button" class="custom-msg-remove" title="Remove">×</button>
  `;
  row.querySelector("select").value = role;
  row.querySelector("textarea").value = content;
  row.querySelector(".custom-msg-remove").addEventListener("click", () => {
    row.remove();
    updateRemoveButtonsEnabled();
  });
  $("#custom-messages").appendChild(row);
}

function updateRemoveButtonsEnabled() {
  const rows = $$("#custom-messages .custom-msg-row");
  rows.forEach((row) => {
    row.querySelector(".custom-msg-remove").disabled = rows.length <= 1;
  });
}

function readCustomForm() {
  return {
    action_description: $("#custom-action").value,
    conversation_history: [...$$("#custom-messages .custom-msg-row")]
      .map((row) => ({
        role: row.querySelector("select").value,
        content: row.querySelector("textarea").value,
      }))
      .filter((m) => m.content.trim()),
    user: {
      trust_level: $("#custom-trust").value,
      preferences: [],
    },
  };
}

// ── decision ──────────────────────────────────────────
function renderDecision(result) {
  const el = $("#decision-body");
  if (!result) {
    el.className = "muted";
    el.textContent = "Run a scenario to see a decision.";
    return;
  }
  el.className = "";

  if (result.error) {
    const simBadge = result.simulated
      ? `<span class="simulated-badge">Simulated</span>`
      : "";
    el.innerHTML = `
      <div>
        <span class="outcome-badge error">${escapeHtml(result.outcome ?? "refuse")}</span>
        <span class="error-type-chip">${escapeHtml(result.error)}</span>
        ${simBadge}
      </div>
      <div class="rationale">${escapeHtml(result.rationale ?? "")}</div>
    `;
    return;
  }

  el.innerHTML = `
    <div>
      <span class="outcome-badge ${escapeAttr(result.outcome)}">${escapeHtml(result.outcome)}</span>
    </div>
    <div class="rationale">${escapeHtml(result.rationale ?? "")}</div>
  `;
}

// ── signals ───────────────────────────────────────────
function renderSignals(signals) {
  const el = $("#signals-body");
  if (!signals) {
    el.className = "muted";
    el.textContent = "— not computed (pipeline failed before this stage) —";
    return;
  }
  el.className = "cards";
  el.innerHTML = [
    renderClarityCard(signals.clarity),
    renderRiskCard(signals.risk),
    renderPolicyCard(signals.policy),
  ].join("");
}

function renderClarityCard(clarity) {
  const hardBlocked =
    !clarity.entity_resolved || clarity.missing_params.length > 0;

  let tone, headline;
  if (hardBlocked) { tone = "bad"; headline = "✗ Needs clarification"; }
  else if (!clarity.intent_clear) { tone = "warn"; headline = "⚠ Intent fuzzy"; }
  else { tone = "ok"; headline = "✓ Ready"; }

  const chips = [
    chip(clarity.entity_resolved ? "entity resolved" : "entity missing",
         clarity.entity_resolved ? "ok" : "bad"),
    chip(clarity.intent_clear ? "intent clear" : "intent unclear",
         clarity.intent_clear ? "ok" : "warn"),
    clarity.missing_params.length > 0
      ? chip(`${clarity.missing_params.length} missing param${clarity.missing_params.length > 1 ? "s" : ""}`, "bad")
      : chip("all params resolved", "ok"),
  ];

  const missingBlock = clarity.missing_params.length > 0
    ? `<div class="missing-params-list">Missing: ${clarity.missing_params.map(escapeHtml).join(", ")}</div>`
    : "";

  return `
    <div class="signal-card" data-tone="${tone}">
      <h3>Clarity</h3>
      <div class="signal-status ${tone}">${headline}</div>
      <div class="chips">${chips.join("")}</div>
      ${missingBlock}
      <details>
        <summary>See full audit</summary>
        <pre class="codeblock">${escapeHtml(JSON.stringify(clarity.audit, null, 2))}</pre>
      </details>
    </div>
  `;
}

function renderRiskCard(risk) {
  const tone = risk.effective_risk === "high" ? "bad"
             : risk.effective_risk === "medium" ? "warn" : "ok";
  const chips = [
    chip(`effective: ${risk.effective_risk}`, `risk-${risk.effective_risk}`),
    chip(`floor: ${risk.min_risk}`, ""),
    chip(risk.reversible ? "reversible" : "irreversible", risk.reversible ? "ok" : "bad"),
    chip(risk.affects_external ? "external" : "internal", risk.affects_external ? "bad" : "ok"),
  ];
  if (risk.risk_elevated) chips.push(chip("elevated by context", "active"));

  const evidenceBlock = risk.risk_elevated && risk.audit.evidence
    ? renderEvidence("Elevation evidence", risk.audit.evidence)
    : "";

  return `
    <div class="signal-card" data-tone="${tone}">
      <h3>Risk</h3>
      <div class="signal-status ${tone}">${risk.effective_risk.toUpperCase()}</div>
      <div class="chips">${chips.join("")}</div>
      ${evidenceBlock}
      <details>
        <summary>See full audit</summary>
        <pre class="codeblock">${escapeHtml(JSON.stringify(risk.audit, null, 2))}</pre>
      </details>
    </div>
  `;
}

function renderPolicyCard(policy) {
  const violated = policy.policy_violated;
  const tone = violated ? "bad" : "ok";
  const chips = [];
  if (violated) {
    chips.push(chip(`policy: ${policy.policy_id}`, "bad"));
    chips.push(chip(`consequence: ${policy.consequence}`, "active"));
  }
  chips.push(chip(`checked ${policy.audit.applicable_policies.length} policies`, ""));

  const evidenceBlock = violated && policy.audit.evidence
    ? renderEvidence(`Policy "${policy.policy_id}" triggered by`, policy.audit.evidence)
    : "";

  return `
    <div class="signal-card" data-tone="${tone}">
      <h3>Policy</h3>
      <div class="signal-status ${tone}">${violated ? "✗ Violation" : "✓ No violation"}</div>
      <div class="chips">${chips.join("")}</div>
      ${evidenceBlock}
      <details>
        <summary>See full audit</summary>
        <pre class="codeblock">${escapeHtml(JSON.stringify(policy.audit, null, 2))}</pre>
      </details>
    </div>
  `;
}

function renderEvidence(label, quote) {
  return `
    <div class="evidence">
      <div class="evidence-label">${escapeHtml(label)}</div>
      <blockquote>"${escapeHtml(quote)}"</blockquote>
    </div>
  `;
}

// ── trace ─────────────────────────────────────────────
function renderTrace(result) {
  const el = $("#trace-body");
  if (!result) {
    el.className = "muted";
    el.textContent = "—";
    return;
  }
  el.className = "";
  const type = result.classification?.parsed?.type ?? null;
  el.innerHTML = `
    ${renderClassificationStage(result.classification)}
    ${renderExtractionStage(result.extraction, type)}
  `;
}

function stageDidNotRun(title) {
  return `
    <details class="stage" open>
      <summary>${escapeHtml(title)}</summary>
      <div class="stage-body"><div class="did-not-run">— did not run —</div></div>
    </details>
  `;
}

function renderRawDetails(trace) {
  const promptStr = formatPrompt(trace.prompt);
  return `
    <details class="raw-details">
      <summary>See raw prompt &amp; output</summary>
      <div class="stage-section">
        <h4>Exact prompt sent to model</h4>
        <pre class="codeblock prompt-block">${escapeHtml(promptStr)}</pre>
      </div>
      <div class="stage-section">
        <h4>Raw model output</h4>
        <pre class="codeblock">${escapeHtml(trace.raw ?? "(empty)")}</pre>
      </div>
      <div class="stage-section">
        <h4>Parsed output (full JSON)</h4>
        <pre class="codeblock">${escapeHtml(JSON.stringify(trace.parsed, null, 2))}</pre>
      </div>
    </details>
  `;
}

function renderClassificationStage(trace) {
  if (!trace) return stageDidNotRun("Stage 1: Classification");
  const { type, reasoning } = trace.parsed ?? {};
  const typeClass = type === "none" ? "none" : "";
  return `
    <details class="stage" open>
      <summary>Stage 1: Classification</summary>
      <div class="stage-body">
        <div class="stage-summary">
          <div class="summary-row">
            <span class="summary-label">Classified as</span>
            <span><span class="type-badge ${typeClass}">${escapeHtml(type ?? "—")}</span></span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Reasoning</span>
            <span class="summary-text">${escapeHtml(reasoning ?? "")}</span>
          </div>
        </div>
        ${renderRawDetails(trace)}
      </div>
    </details>
  `;
}

function renderExtractionStage(trace, type) {
  if (!trace) return stageDidNotRun("Stage 2: Extraction");
  const { overall, triplets } = extractTriplets(trace.parsed ?? {});

  const summaryRows = [];
  if (type) {
    summaryRows.push(`
      <div class="summary-row">
        <span class="summary-label">Extracted for</span>
        <span><span class="type-badge">${escapeHtml(type)}</span></span>
      </div>
    `);
  }
  if (overall) {
    summaryRows.push(`
      <div class="summary-row">
        <span class="summary-label">Overall reasoning</span>
        <span class="summary-text">${escapeHtml(overall)}</span>
      </div>
    `);
  }

  const tripletsHtml = triplets.length
    ? `<div class="triplet-list">${triplets.map(renderTripletCard).join("")}</div>`
    : `<div class="muted" style="padding: 8px 0;">No triplet fields in parsed output.</div>`;

  return `
    <details class="stage" open>
      <summary>Stage 2: Extraction (${triplets.length} fields)</summary>
      <div class="stage-body">
        ${summaryRows.length ? `<div class="stage-summary">${summaryRows.join("")}</div>` : ""}
        ${tripletsHtml}
        ${renderRawDetails(trace)}
      </div>
    </details>
  `;
}

function extractTriplets(parsed) {
  const triplets = [];
  const consumed = new Set();
  for (const key of Object.keys(parsed)) {
    if (key.endsWith("_reasoning") || key.endsWith("_evidence")) continue;
    const r = `${key}_reasoning`;
    const e = `${key}_evidence`;
    if (r in parsed && e in parsed) {
      triplets.push({
        field: key,
        value: parsed[key],
        reasoning: parsed[r],
        evidence: parsed[e],
      });
      consumed.add(key);
      consumed.add(r);
      consumed.add(e);
    }
  }
  const overall = parsed.reasoning ?? null;
  return { overall, triplets };
}

function renderTripletCard({ field, value, reasoning, evidence }) {
  const isNull = value == null;
  const valueDisplay = isNull ? "not extracted" : String(value);
  const evidenceBlock = evidence != null
    ? `
      <div class="triplet-section">
        <div class="triplet-label">Evidence</div>
        <blockquote class="triplet-quote">"${escapeHtml(evidence)}"</blockquote>
      </div>
    `
    : "";
  const reasoningBlock = reasoning
    ? `
      <div class="triplet-section">
        <div class="triplet-label">Reasoning</div>
        <div class="triplet-text">${escapeHtml(reasoning)}</div>
      </div>
    `
    : "";
  return `
    <div class="triplet-card" data-null="${isNull}">
      <div class="triplet-head">
        <span class="field-name">${escapeHtml(field)}</span>
        <span class="field-value ${isNull ? "null" : ""}" title="${escapeAttr(valueDisplay)}">${escapeHtml(valueDisplay)}</span>
      </div>
      <div class="triplet-body">
        ${reasoningBlock}
        ${evidenceBlock}
      </div>
    </div>
  `;
}

// ── event handlers ────────────────────────────────────
function onScenarioClick(scenario) {
  customMode = false;
  jsonMode = false;
  hideFailureTimeline();
  currentInput = deepClone(scenario.input);
  setActiveButton(scenario.id);
  renderExplainer({
    category: scenario.category,
    heading: scenarioHeading(scenario),
    title: scenario.label,
    explanation: scenario.explanation,
  });
  renderInput(currentInput);
  renderDecision(null);
  renderSignals(null);
  renderTrace(null);
}

async function onFailureDemoClick(kind) {
  customMode = false;
  jsonMode = false;
  setActiveButton(kind);
  renderExplainer({
    category: "failure",
    heading: "Failure Demo",
    title: failureLabel(kind),
    explanation: failureExplanation(kind),
  });

  let body;
  if (kind === "missing_context") {
    currentInput = { action_description: "", conversation_history: [] };
    body = { input: currentInput };
  } else {
    const base = scenarios.find((s) => s.id === "pending_hold_override") ?? scenarios[0];
    currentInput = deepClone(base.input);
    body = { input: currentInput, simulate: kind };
  }
  renderInput(currentInput);

  const token = showFailureTimeline(kind);
  const animation = animateFailureTimeline(kind, token);
  await runAndRender(body);
  await animation;
}

// ── failure timeline ──────────────────────────────────
const TIMELINE_SCRIPTS = {
  timeout: [
    { label: "Validating input shape",                              duration: 40,   finalStatus: "done" },
    { label: "Stage 1 — LLM attempt 1/3 (50ms timeout)",            duration: 80,   finalStatus: "failed" },
    { label: "Backoff 1000ms · temperature += 0.1",                 duration: 1000, finalStatus: "done" },
    { label: "Stage 1 — LLM attempt 2/3 (50ms timeout)",            duration: 80,   finalStatus: "failed" },
    { label: "Backoff 2000ms · temperature += 0.1",                 duration: 2000, finalStatus: "done" },
    { label: "Stage 1 — LLM attempt 3/3 (50ms timeout)",            duration: 80,   finalStatus: "failed" },
    { label: "Retries exhausted → return typed error (refuse)",     duration: 40,   finalStatus: "failed" },
  ],
  missing_context: [
    { label: "Request received at /api/decide",                         duration: 80,  finalStatus: "done" },
    { label: "Validating action_description — EMPTY",                   duration: 80,  finalStatus: "failed" },
    { label: "Short-circuit: skip LLM, return refuse (missing_context)", duration: 60, finalStatus: "failed" },
  ],
  malformed: [
    { label: "Request received at /api/decide",                         duration: 80, finalStatus: "done" },
    { label: "simulate=malformed detected at server boundary",          duration: 80, finalStatus: "done" },
    { label: "Inject synthetic malformed_output error (refuse)",        duration: 60, finalStatus: "failed" },
  ],
};

let timelineToken = 0;

function showFailureTimeline(kind) {
  const card = $("#failure-timeline");
  const body = $("#failure-timeline-body");
  card.classList.remove("hidden");
  const token = ++timelineToken;
  const steps = TIMELINE_SCRIPTS[kind] ?? [];
  body.dataset.token = String(token);
  body.innerHTML = steps
    .map((s, i) => `
      <div class="timeline-step" data-status="pending" data-idx="${i}">
        <span class="timeline-icon">⋯</span>
        <span class="timeline-label">${escapeHtml(s.label)}</span>
        <span class="timeline-duration">${s.duration}ms</span>
      </div>
    `)
    .join("");
  return token;
}

function hideFailureTimeline() {
  timelineToken++;
  $("#failure-timeline").classList.add("hidden");
  $("#failure-timeline-body").innerHTML = "";
}

async function animateFailureTimeline(kind, token) {
  const steps = TIMELINE_SCRIPTS[kind] ?? [];
  const body = $("#failure-timeline-body");
  for (let i = 0; i < steps.length; i++) {
    if (Number(body.dataset.token) !== token) return;
    const el = body.querySelector(`.timeline-step[data-idx="${i}"]`);
    if (!el) return;
    el.dataset.status = "running";
    el.querySelector(".timeline-icon").textContent = "↻";
    await sleep(steps[i].duration);
    if (Number(body.dataset.token) !== token) return;
    el.dataset.status = steps[i].finalStatus;
    el.querySelector(".timeline-icon").textContent =
      steps[i].finalStatus === "failed" ? "✗" : "✓";
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function onCustomNewClick() {
  customMode = true;
  jsonMode = false;
  hideFailureTimeline();
  currentInput = {
    action_description: "",
    conversation_history: [{ role: "user", content: "" }],
    user: { trust_level: "established", preferences: [] },
  };
  setActiveButton("new");
  renderExplainer({
    category: "custom",
    heading: "Custom Input",
    title: "Test Your Own Case",
    explanation:
      "Fill in the proposed action and build a conversation below, then click Run. The same pipeline that handles preloaded scenarios will run against your input.",
  });
  renderCustomForm(currentInput);
  renderDecision(null);
  renderSignals(null);
  renderTrace(null);
}

async function onRunClick() {
  if (customMode) {
    if (jsonMode) {
      // switch back to form first so user sees what they'll submit
      jsonMode = false;
      renderCustomForm(currentInput);
    }
    currentInput = readCustomForm();
  } else if (jsonMode) {
    try {
      currentInput = JSON.parse($("#input-json").value);
    } catch (err) {
      showInputError(`Invalid JSON: ${err.message}`);
      return;
    }
  }
  await runAndRender({ input: currentInput });
}

function onToggleEdit() {
  if (customMode) {
    // capture form values before swapping to JSON view
    if (!jsonMode) currentInput = readCustomForm();
    jsonMode = !jsonMode;
    renderCustomForm(currentInput);
    return;
  }
  if (jsonMode) {
    try {
      currentInput = JSON.parse($("#input-json").value);
    } catch (err) {
      showInputError(`Invalid JSON: ${err.message}`);
      return;
    }
  }
  jsonMode = !jsonMode;
  renderInput(currentInput);
}

async function runAndRender(body) {
  const btn = $("#run");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Running…`;
  renderDecision(null);
  renderSignals(null);
  renderTrace(null);
  $("#decision-body").innerHTML = `<span class="spinner"></span>Running pipeline…`;
  try {
    const result = await runDecision(body);
    renderDecision(result);
    renderSignals(result.signals);
    renderTrace(result);
  } catch (err) {
    renderDecision({
      error: "network_error",
      outcome: "refuse",
      rationale: err.message,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = "Run";
  }
}

// ── helpers ───────────────────────────────────────────
function formatPrompt(prompt) {
  if (prompt == null) return "(empty)";
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) {
    return prompt.map((m) => `── ${m.role} ──\n${m.content}`).join("\n\n");
  }
  if (typeof prompt === "object") {
    return Object.entries(prompt)
      .map(([role, content]) => `── ${role} ──\n${content}`)
      .join("\n\n");
  }
  return String(prompt);
}

function chip(label, kind = "") {
  return `<span class="chip ${escapeAttr(kind)}">${escapeHtml(label)}</span>`;
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
}
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
function showInputError(msg) {
  const el = $("#input-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function failureLabel(kind) {
  return {
    missing_context: "Missing context",
    timeout: "Simulated timeout",
    malformed: "Simulated malformed output",
  }[kind];
}
function failureExplanation(kind) {
  return {
    missing_context:
      "Submits an empty input. Pipeline validates at the entry point and short-circuits to refuse without calling the LLM — trace stages show 'did not run'.",
    timeout:
      "Runs the real pipeline against a scenario with a 50ms timeout, forcing all 3 retries (1s + 2s + 4s backoff) to exhaust. Exercises the actual retry + temperature-bump code path.",
    malformed:
      "Simulates a malformed model response at the server boundary. The pipeline itself handles this via a typed `malformed_output` error; here we inject the error directly so you can see the UI's failure state.",
  }[kind];
}

// ── init ──────────────────────────────────────────────
/** About panel must work even before scenarios load (e.g. gated demo, wrong key). */
function bindAboutToggle() {
  const btn = $("#about-toggle");
  const panel = $("#about-panel");
  if (!btn || !panel || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    const hidden = panel.classList.toggle("hidden");
    const open = !hidden;
    btn.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", String(open));
    const label = open ? "Hide about this prototype" : "Show about this prototype";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  });
}

async function attemptLoadScenarios() {
  $("#demo-password-msg").textContent = "";
  if (authRequired && !getDemoPasswordForRequest()) {
    $("#demo-password-bar-wrap")?.classList.remove("is-retracted");
    $("#demo-password-msg").textContent =
      "Enter the demo key from the email in the field above, then click Apply.";
    return;
  }
  try {
    scenarios = await fetchScenarios();
    if (authRequired) {
      try {
        sessionStorage.setItem("alfred_demo_pw", getDemoPasswordForRequest());
      } catch (_) {
        /* ignore */
      }
    }
    if (!bootstrapped) {
      bootstrapped = true;
      bootstrapApp();
    } else {
      renderSidebar();
    }
    if (authRequired && scenarios.length > 0) {
      $("#demo-password-bar-wrap")?.classList.add("is-retracted");
    }
  } catch (e) {
    if (e.message === "demo_auth_required") {
      $("#demo-password-bar-wrap")?.classList.remove("is-retracted");
      $("#demo-password-msg").textContent = authRequired
        ? getDemoPasswordForRequest()
          ? "That key was not accepted. Check the email and try again, then Apply."
          : "Enter the demo key from the email, then click Apply."
        : "Could not load scenarios.";
    } else {
      $("#demo-password-msg").textContent = "Network error.";
    }
  }
}

/** Run / custom / JSON toggle work even if scenarios have not loaded yet (demo gate). */
function bindCoreControlsOnce() {
  const run = $("#run");
  if (run && run.dataset.bound !== "1") {
    run.dataset.bound = "1";
    run.addEventListener("click", onRunClick);
  }
  const toggle = $("#toggle-edit");
  if (toggle && toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", onToggleEdit);
  }
  $$(".custom-list button").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", onCustomNewClick);
  });
}

async function bootstrapApp() {
  renderSidebar();
  $$(".failure-list button").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.dataset.category = "failure";
    btn.addEventListener("click", () => onFailureDemoClick(btn.dataset.failure));
  });
}

async function init() {
  bindAboutToggle();

  let session;
  try {
    const res = await fetch("/api/session", fetchOpts);
    session = await res.json();
  } catch {
    $("#demo-password-bar-wrap").classList.remove("hidden");
    $("#demo-password-msg").textContent = "Could not reach the server.";
    return;
  }

  authRequired = session.authRequired;
  if (authRequired) {
    $("#demo-password-bar-wrap").classList.remove("hidden");
    try {
      const saved = sessionStorage.getItem("alfred_demo_pw");
      if (saved) $("#demo-password-bar").value = saved;
    } catch (_) {
      /* ignore */
    }
    $("#demo-password-apply").addEventListener("click", () => attemptLoadScenarios());
    $("#demo-password-bar").addEventListener("keydown", (e) => {
      if (e.key === "Enter") attemptLoadScenarios();
    });
    $("#demo-password-expand").addEventListener("click", () => {
      $("#demo-password-bar-wrap").classList.remove("is-retracted");
    });
  }

  bindCoreControlsOnce();

  await attemptLoadScenarios();
}

init();
