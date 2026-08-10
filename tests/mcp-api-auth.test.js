import { describe, expect, it } from "vitest";
import { getMcpApiKey, isAuthorizedMcpRequest } from "../src/mcp-api-auth.js";

describe("MCP API authentication", () => {
  it("allows requests by default", () => {
    expect(isAuthorizedMcpRequest({}, {})).toBe(true);
  });

  it("rejects missing and invalid credentials when keys are required", () => {
    const config = { mcpAllowUnauthenticated: false, mcpApiKeys: ["test-secret"] };
    expect(isAuthorizedMcpRequest({}, config)).toBe(false);
    expect(isAuthorizedMcpRequest({ authorization: "Bearer wrong" }, config)).toBe(false);
  });

  it("accepts Bearer and X-API-Key credentials", () => {
    const config = { mcpAllowUnauthenticated: false, mcpApiKeys: ["test-secret"] };
    expect(getMcpApiKey({ authorization: "Bearer test-secret" })).toBe("test-secret");
    expect(isAuthorizedMcpRequest({ authorization: "Bearer test-secret" }, config)).toBe(true);
    expect(isAuthorizedMcpRequest({ "x-api-key": "test-secret" }, config)).toBe(true);
  });
});
