# MCP API Keys

## Goal

Allow HTTP MCP access to be either open for private/local use or protected by
managed API keys, without changing stdio MCP behavior.

## Implementation

- [x] `MCP_API_KEYS` holds comma-separated HTTP MCP secrets.
- [x] `MCP_ALLOW_UNAUTHENTICATED` defaults to `1`; set it to `0` to require a key.
- [x] `/mcp` accepts `Authorization: Bearer <key>` and `X-API-Key: <key>`.
- [x] `/console/keys` creates a random key, reveals it once, shows masked saved keys, and revokes keys.
- [x] Console changes persist to `.env` and apply to the running server immediately.
- [x] CORS preflight allows the API-key request headers.

## Security Boundary

MCP API keys guard only `/mcp`. Stdio is a local process transport and console
management must stay on a trusted network or behind reverse-proxy access
control. Otherwise anyone who can reach `/console/keys` could create a key.

## Verification

- [x] Cover open, rejected, and accepted credential checks.
- [x] Verify the management page in a running browser.
