/**
 * Unit tests: demo password header matching and gate middleware.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { passwordMatches, requireDemoAuth, HEADER } = require("../src/demoAuth");

describe("passwordMatches", () => {
  test("accepts exact match", () => {
    assert.equal(passwordMatches("hello", "hello"), true);
  });

  test("rejects wrong password", () => {
    assert.equal(passwordMatches("hello", "world"), false);
  });

  test("rejects empty when expected non-empty", () => {
    assert.equal(passwordMatches("", "secret"), false);
  });

  test("matches unicode consistently", () => {
    const u = "パスワード";
    assert.equal(passwordMatches(u, u), true);
  });
});

describe("requireDemoAuth", () => {
  test("calls next when DEMO_PASSWORD unset", () => {
    const prev = process.env.DEMO_PASSWORD;
    delete process.env.DEMO_PASSWORD;

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };
    const req = { get: () => undefined };
    const res = { status() {}, json() {} };

    requireDemoAuth(req, res, next);
    assert.equal(nextCalls, 1);

    if (prev !== undefined) process.env.DEMO_PASSWORD = prev;
  });

  test("401 when password set and header missing", () => {
    const prev = process.env.DEMO_PASSWORD;
    process.env.DEMO_PASSWORD = "sekrit";

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };
    const req = { get: () => undefined };
    let statusCode;
    let jsonBody;
    const res = {
      status(code) {
        statusCode = code;
        return res;
      },
      json(body) {
        jsonBody = body;
      },
    };

    requireDemoAuth(req, res, next);
    assert.equal(nextCalls, 0);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody.error, "demo_auth_required");

    if (prev !== undefined) process.env.DEMO_PASSWORD = prev;
    else delete process.env.DEMO_PASSWORD;
  });

  test("next when header matches DEMO_PASSWORD", () => {
    const prev = process.env.DEMO_PASSWORD;
    process.env.DEMO_PASSWORD = "correct-horse";

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };
    const req = {
      get: (name) => (name === HEADER ? "correct-horse" : undefined),
    };
    const res = { status() {}, json() {} };

    requireDemoAuth(req, res, next);
    assert.equal(nextCalls, 1);

    if (prev !== undefined) process.env.DEMO_PASSWORD = prev;
    else delete process.env.DEMO_PASSWORD;
  });
});
