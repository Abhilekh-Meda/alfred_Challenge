/**
 * Spawns server.js with a clean env and exercises HTTP API + demo gate + rate limit.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT_BASE = 28000;

function httpRequest(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: { ...headers },
    };
    if (body != null) {
      const raw = typeof body === "string" ? body : JSON.stringify(body);
      opts.headers["content-type"] = opts.headers["content-type"] ?? "application/json";
      opts.headers["content-length"] = Buffer.byteLength(raw);
    }
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c;
      });
      res.on("end", () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on("error", reject);
    if (body != null) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function startServer(envExtra) {
  const port = envExtra.PORT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        ...envExtra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    const t = setTimeout(() => {
      child.kill();
      reject(new Error(`server start timeout on :${port}\n${stderr}`));
    }, 8000);

    function tryPing() {
      httpRequest(port, "GET", "/api/session")
        .then(() => {
          clearTimeout(t);
          resolve({ child, port, stderr });
        })
        .catch(() => {
          setTimeout(tryPing, 80);
        });
    }
    tryPing();
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.on("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2000);
  });
}

describe("HTTP API without DEMO_PASSWORD", () => {
  let child;
  let port;

  before(async () => {
    port = PORT_BASE + 1;
    const r = await startServer({
      PORT: String(port),
      DEMO_PASSWORD: "",
      RATE_LIMIT_MAX_PER_HOUR: "1000",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test-placeholder",
    });
    child = r.child;
  });

  after(async () => {
    if (child) await stopServer(child);
  });

  test("GET /api/session authRequired false", async () => {
    const r = await httpRequest(port, "GET", "/api/session");
    assert.equal(r.status, 200);
    assert.equal(r.body.authRequired, false);
  });

  test("GET /api/scenarios returns array", async () => {
    const r = await httpRequest(port, "GET", "/api/scenarios");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length >= 6);
  });

  test("POST /api/decide simulate malformed without LLM", async () => {
    const r = await httpRequest(port, "POST", "/api/decide", {
      body: { input: { x: 1 }, simulate: "malformed" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.error, "malformed_output");
    assert.equal(r.body.simulated, true);
  });

  test("POST /api/decide empty input missing_context", async () => {
    const r = await httpRequest(port, "POST", "/api/decide", {
      body: { input: {} },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.error, "missing_context");
  });

  test("GET / serves index HTML with demo password strip", async () => {
    const r = await httpRequest(port, "GET", "/");
    assert.equal(r.status, 200);
    assert.match(r.raw, /demo-password-bar-wrap/);
    assert.match(r.raw, /demo-password-headline/);
    assert.match(r.raw, /Execution Decision Layer/);
  });
});

describe("HTTP API with DEMO_PASSWORD", () => {
  let child;
  let port;
  const SECRET = "integration-test-secret-xyz";

  before(async () => {
    port = PORT_BASE + 2;
    const r = await startServer({
      PORT: String(port),
      DEMO_PASSWORD: SECRET,
      RATE_LIMIT_MAX_PER_HOUR: "1000",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test-placeholder",
    });
    child = r.child;
  });

  after(async () => {
    if (child) await stopServer(child);
  });

  test("GET /api/session authRequired true", async () => {
    const r = await httpRequest(port, "GET", "/api/session");
    assert.equal(r.status, 200);
    assert.equal(r.body.authRequired, true);
  });

  test("GET /api/scenarios 401 without header", async () => {
    const r = await httpRequest(port, "GET", "/api/scenarios");
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "demo_auth_required");
  });

  test("GET /api/scenarios 401 wrong header", async () => {
    const r = await httpRequest(port, "GET", "/api/scenarios", {
      headers: { "X-Demo-Password": "wrong" },
    });
    assert.equal(r.status, 401);
  });

  test("GET /api/scenarios 200 with correct header", async () => {
    const r = await httpRequest(port, "GET", "/api/scenarios", {
      headers: { "X-Demo-Password": SECRET },
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test("POST /api/decide 401 without header", async () => {
    const r = await httpRequest(port, "POST", "/api/decide", {
      body: { input: {}, simulate: "malformed" },
    });
    assert.equal(r.status, 401);
  });

  test("POST /api/decide 200 malformed with correct header", async () => {
    const r = await httpRequest(port, "POST", "/api/decide", {
      headers: { "X-Demo-Password": SECRET },
      body: { input: { note: 1 }, simulate: "malformed" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.error, "malformed_output");
  });

  test("many POST /api/decide calls with same header (like switching scenarios + Run)", async () => {
    const hdr = { "X-Demo-Password": SECRET };
    for (let i = 0; i < 8; i++) {
      const r = await httpRequest(port, "POST", "/api/decide", {
        headers: hdr,
        body: { input: {}, simulate: "malformed" },
      });
      assert.equal(r.status, 200, `call ${i + 1}`);
      assert.equal(r.body.error, "malformed_output");
    }
  });
});

describe("rate limit on POST /api/decide", () => {
  let child;
  let port;

  before(async () => {
    port = PORT_BASE + 3;
    const r = await startServer({
      PORT: String(port),
      DEMO_PASSWORD: "",
      RATE_LIMIT_MAX_PER_HOUR: "4",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test-placeholder",
    });
    child = r.child;
  });

  after(async () => {
    if (child) await stopServer(child);
  });

  test("429 after exceeding max (4) decide calls per hour", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await httpRequest(port, "POST", "/api/decide", {
        body: { input: {}, simulate: "malformed" },
      });
      assert.equal(r.status, 200, `call ${i + 1} should succeed`);
    }
    const last = await httpRequest(port, "POST", "/api/decide", {
      body: { input: {}, simulate: "malformed" },
    });
    assert.equal(last.status, 429);
    assert.equal(last.body.error, "rate_limited");
  });
});
