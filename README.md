# alfred_ Execution Decision Layer

Given a proposed action plus conversation context, decide whether alfred_ should execute silently, execute and notify, confirm first, ask a clarifying question, or refuse.

- **Live demo:** _(pending deploy)_
- **Repo:** https://github.com/Abhilekh-Meda/alfred_Challenge

Run locally:

```bash
npm install
OPENAI_API_KEY=sk-... npm start
```

Then open http://localhost:3000.

For the public demo, use the password from my email and paste into the "Demo password" field (the LLM api is not exposed without it).

---

## 1. Scope: where I drew the line

The product problem has two layers:

1. **Context pipeline.** Reads conversation history, user state, and memory. Extracts the active task. Produces a structured, ready-to-reason-over input.
2. **Decision layer.** Takes that structured input and returns a routing verdict plus rationale.

**Only the decision layer is in scope for this challenge.** The prototype's context pipeline is deliberately stubbed: preloaded scenarios hand in pre-shaped inputs, and the "Test your own case" form lets you build a conversation by hand. No retrieval, no persistence, no long-context handling.

Why this split:

- Real context ingestion is its own multi-day problem (semantic indexing, agentic RAG, supermemory-style recall). Spending time there would have meant a worse decision layer.
- The decision layer *owns* the task schema. The context layer *populates* it. That interface contract is the thing worth getting right, and it lets the two layers evolve independently.
- Designing from the decision layer's perspective forces a clear statement of "what does this component actually need to make a good decision?" That question alone rules out a lot of hand-wavy context blobs.

If you open the UI and click the `i` in the header, you'll see the same framing in-app so reviewers who don't read the repo still have it.

---

## 2. Architecture at a glance

Four stages per request:

```
Stage 1  classify action type              small LLM
Stage 2  extract params / risk / policy    larger LLM, targeted schema
Stage 3  deterministic signals + routing   pure code
Stage 4  rationale synthesis               small LLM
```

### Why two LLM stages instead of one

Stage 1 is cheap and fast: output is just `{ type, reasoning }`. Its job is to pick which action-specific schema to load for stage 2. Stage 2 then gets a focused prompt that only includes the fields for the classified action type, not the whole action registry. One big LLM call seeing every possible action would be noisier, more expensive, and harder to audit.

In production I would use a tiny local classifier (or a small open-source model, possibly not even an LLM) for stage 1, and a frontier model like Sonnet 4.6 for stage 2's judgment-heavy extraction. The prototype uses `gpt-4o-mini` and `gpt-4o` as proxies because that is the API key I had available.

### Mapping outcomes to the spec's boundary rules

| Outcome | When |
|---|---|
| `ask_clarifying_question` | intent, entity, or key params unresolved |
| `confirm_before_executing` | resolved, but effective risk above silent threshold |
| `refuse` | policy violation, or residual risk/uncertainty too high after clarification |
| `execute_silently` | resolved, low risk, trusted user, no surprise factor |
| `execute_and_notify` | resolved, low risk, but the user should know this happened |

The `execute_silently` vs `execute_and_notify` split is the one the spec leaves to us. I used a "how surprised would the user be if this happened with no word" heuristic, driven by whether the action affects external parties or the user's calendar/inbox visibly.

---

## 3. Signals the system uses, and why

Three signal bundles feed the router. Each one maps to a specific boundary rule from the spec.

### Clarity (drives ask vs. proceed)

- `intent_clear`: does the LLM have enough context to explain *why* this action is being proposed?
- `entity_resolved`: is there a specific object this action targets (an email to reply to, an event to delete)?
- `missing_params`: list of required parameters the LLM could not extract with evidence.

This is the first gate. If any of these fail, we ask a clarifying question. No judgment call, no LLM needed at routing time.

### Risk (drives silent vs. confirm vs. refuse)

- `min_risk`: a floor pulled deterministically from per-action-type metadata. `send_email` cannot be "low" no matter what the LLM thinks.
- `effective_risk`: LLM assessment from stage 2, given the action's base risk plus conversation context.
- `final_risk = max(min_risk, effective_risk)`: action metadata sets a floor the LLM cannot undercut, but the LLM can raise risk above that floor when context demands (confidential content, explicit pricing commitments, earlier user hold).
- `reversible`, `affects_external`: bookkeeping axes used by the router.

The max-floor design is deliberate. Pure LLM risk assessment is unsafe (easy to talk it into "low"). Pure code risk is blind to context. Max of both gives you a safety floor plus context sensitivity.

### Policy (can override everything)

Policies are structured objects with `id`, `description`, `applies_to` (action types, or null for all), `consequence` (`refuse` or `confirm_before_executing`), and an evidence field. Stage 2 is told which policies apply to the classified action and must cite verbatim evidence if it flags one.

Keeping policies as data (not prompt text) means they are auditable, per-policy testable, and composable later when we add priorities. A violated policy shortcuts routing regardless of other signals.

### User trust

`trust_level` and `preferences` tilt the silent-vs-notify boundary. A known-trusted user with explicit preferences ("always send emails signed from me") gets more silent execution. A new user with no preferences gets more notifications.

---

## 4. LLM vs. deterministic code: the split

The guiding principle: **we control the schema, the LLM populates it, and we control what to do with it.** LLMs are good at reading unstructured text and filling structured fields. They are not good at being asked "should alfred_ do this?" in a free-form way. Keeping routing deterministic means it is auditable, unit-testable, cheap, and predictable.

| What the LLM decides | What code decides |
|---|---|
| Classify action type from conversation | Which policies apply to that action type |
| Populate per-field reasoning, evidence, and value in the extraction schema | Param completeness and evidence-presence checks |
| Assess effective risk given context | `min_risk` floor from action metadata |
| Identify policy violations and cite evidence | `max(min_risk, effective_risk)` risk floor |
| Write the final rationale prose | Routing: signals to outcome |
| | Failure mode handling (timeout, malformed, missing context) |

Not letting the LLM pick the outcome directly was the single biggest design decision. It is harder to audit, has more variance, cannot be unit-tested, and you lose the ability to enforce class-wide rules like "this action class must always confirm."

---

## 5. Prompt design

Four mechanisms work together to keep extraction grounded.

1. **Triplet pattern.** Every extracted field has three siblings in the zod schema: `{field}_reasoning`, `{field}_evidence` (verbatim quote from the conversation), and `{field}` (the value, or null). The LLM must explain its reasoning, cite a verbatim quote, and only then commit a value. Forcing evidence before value drops hallucination and makes every extraction auditable. The "Under the hood" UI surfaces this pattern as first-class triplet cards.

2. **Reasoning before answer** (chain-of-thought inside the schema). The overall `reasoning` field comes first, then each field's triplet. Committing to reasoning before a value produces more consistent outputs.

3. **Null-allowed with an explicit rule.** System prompt states: "Only extract what is explicitly present. When in doubt, use null. Do not infer or assume." Every field's description reiterates the null condition. If evidence is null, value is null. This turns "couldn't find it" into a first-class signal rather than a hallucinated fallback.

4. **Targeted schemas.** Stage 2 gets only the fields relevant to the classified action type, built dynamically from `ACTION_META`. Smaller prompt, less noise, better extraction quality.

Structured I/O via zod schemas plus OpenAI's `response_format` means no free-form parsing at the boundary.

---

## 6. Failure modes

Default-safe posture: every failure path routes to `refuse`, never to silent execution.

| Failure | What happens | How to see it |
|---|---|---|
| **LLM timeout** | 3 attempts with exponential backoff (1s, 2s) and a small temperature bump per retry. Temperature bump breaks deterministic-failure loops where the same prompt hits the same timeout cause. On exhaustion, typed error to `refuse`. | "Simulated timeout" in the UI forces a 50ms timeout and shows a live animated timeline of the real retry path. |
| **Malformed output** | Zod validation fails at parse. Typed `malformed_output` error to `refuse`. | "Simulated malformed output" injects the error at the server boundary so you can see the UI's failure state without waiting for a real bad response. |
| **Missing critical context** | Pipeline validates at entry. Short-circuits to `refuse` without calling the LLM. Both trace stages render "did not run". | "Missing context" demo submits empty input. |

All three demos are wired into the sidebar under "Failure demos" and animate a step-by-step timeline so reviewers can see what the pipeline is actually doing in real time.

---

## 7. What I chose not to build

Being explicit about the edges:

- **No real context layer.** No retrieval, no persistence, no cross-session memory. Preloaded scenarios hand in pre-shaped inputs.
- **`entity_id` is a descriptive string** like "email from Sarah at Acme, Tuesday, subject: Renewal". Shows anchoring to a specific object without requiring actual data access. In prod this becomes a real ID via a lookup step.
- **Single policy violation at a time.** The schema has one `policy_violation` triplet, not an array. Multi-violation support is a schema change when we need it.
- **Models are proxies.** `gpt-4o-mini` and `gpt-4o` stand in for what would actually be a tiny local classifier plus Sonnet 4.6.
- **No user-feedback learning loop.** Accept/reject/clarify outcomes are not tracked and thresholds are global, not per-user.
- **"Ask clarifying" returns a verdict, not a drafted question.** Drafting the actual question is a UX problem worth owning but out of scope for 6 hours.
- **No streaming, no caching, no offline eval harness.**

---

## 8. Evolution as alfred_ gains riskier tools

- **Policy engine** grows from a flat list to composable rules with priorities and a simple authoring UI for non-engineers.
- **Add `blast_radius` as an axis separate from risk.** Financial, social, and irreversibility-on-external-systems are different concerns. Right now they collapse into "risk high." They shouldn't.
- **Per-user trust thresholds** instead of global ones. A power user with 6 months of explicit preferences should get more silent execution than a week-old user, even for the same action.
- **Entity resolution promoted from string to real ID** via the context layer's retrieval. Makes `entity_resolved` a real check, not a proxy.
- **Human-in-the-loop escalation queue for refuse outcomes.** Right now refuse is terminal. For ambiguous refusals, alfred_ should be able to escalate to a human reviewer.
- **Dry-run / preview state** for genuinely high-stakes actions (external financial commitments, contract language) before a normal confirm. Adds a preview step between confirm and execute.
- **Per-action-class kill switches and audit logging** shipped to monitoring, so a regression in one action type doesn't silently degrade everything.

---

## 9. What I'd build next in 6 months

1. **Real context layer.** Retrieval plus task state persistence across sessions. Agentic RAG over conversation, email, calendar, notes. Supermemory-style recall. This is the other half of the product and it is what lets the decision layer actually shine.
2. **User-trust feedback loop.** Track accept/reject/clarify outcomes per user. Tune silent-execution thresholds and per-user policy strictness. Over time, trust becomes a learned signal, not a static level.
3. **Offline eval harness.** Labeled scenario set, regression testing on prompt, model, and threshold changes, CI-gated. You cannot ship prompt or threshold changes safely without this.
4. **"Ask a good clarifying question."** Currently the verdict is "ask clarifying." The actual question alfred_ drafts is its own LLM call with its own prompt. Getting this right is a UX problem worth owning.
5. **Policy composition and authoring UI.** Non-engineers should be able to add a policy without touching code.
6. **Observability.** Per-decision logs keyed on inputs plus signals, for post-hoc debugging, user appeals, and for the eval harness above.

---

## 10. A note on code layout

```
server.js                  Express app, one POST endpoint, simulation boundaries
src/pipeline.js            4-stage orchestration, typed error handling
src/classify.js            Stage 1: action type classification
src/extraction/            Stage 2: targeted schema extraction per action
src/signals/               Deterministic clarity, risk, policy computation
src/router.js              Pure function: signals to outcome
src/schemas.js             Zod schemas, triplet pattern, ACTION_META
src/policies.js            Structured policy objects
src/llmClient.js           OpenAI client with retry, backoff, temperature bump
src/scenarios.js           6 preloaded scenarios (2 clear, 2 ambiguous, 2 adversarial)
src/errorResponse.js       Shared error-shape helper
public/                    Vanilla JS frontend, no build step
```

No framework, no build step on the frontend, no ORM. The prototype is meant to be readable top to bottom.
