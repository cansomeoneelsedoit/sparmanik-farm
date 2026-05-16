import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkApiToken } from "./auth-token";

const TOKEN_ENV = "FARM_API_TOKEN";

describe("checkApiToken", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[TOKEN_ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[TOKEN_ENV];
    else process.env[TOKEN_ENV] = original;
  });

  it("passes through when no token is configured", () => {
    delete process.env[TOKEN_ENV];
    const result = checkApiToken(new Request("http://x/api"));
    expect(result.ok).toBe(true);
  });

  it("rejects when token is configured and missing", () => {
    process.env[TOKEN_ENV] = "secret";
    const result = checkApiToken(new Request("http://x/api"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("accepts a matching bearer token", () => {
    process.env[TOKEN_ENV] = "secret";
    const result = checkApiToken(
      new Request("http://x/api", { headers: { Authorization: "Bearer secret" } }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a mismatched bearer token", () => {
    process.env[TOKEN_ENV] = "secret";
    const result = checkApiToken(
      new Request("http://x/api", { headers: { Authorization: "Bearer wrong" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
