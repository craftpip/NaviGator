const BASE = process.env.NAVIGATOR_URL || "http://localhost:1994/mcp";

export async function mcpCall(name, arguments_) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: arguments_ }
    })
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Request failed (${res.status})`);
  }
  return body.result;
}
