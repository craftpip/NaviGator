import { useEffect, useState } from "react";
import { request } from "../../lib/request.js";
import { formatKeyDate } from "../../lib/format.js";
import { Panel, Empty, Pill, Check } from "../../components/ui.jsx";

export function Keys() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [allowedTools, setAllowedTools] = useState([]);
  const [creating, setCreating] = useState(false);
  const load = async () => {
    try {
      const payload = await request("/console/api-keys");
      setState(payload);
      setAllowedTools(payload.toolGroups.flatMap((group) => group.tools));
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const mutate = async (body, success) => {
    try {
      const next = await request("/console/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setState(next);
      setSecret(next.key || "");
      if (body.action === "create") {
        setName("");
        setCreating(false);
      }
      setMessage(success);
      setKind("ok");
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  const openAccess = state?.allowUnauthenticated;
  const toolGroups = state?.toolGroups || [];
  const allTools = toolGroups.flatMap((group) => group.tools);
  const toggleTool = (tool) => setAllowedTools((current) =>
    current.includes(tool) ? current.filter((name) => name !== tool) : [...current, tool],
  );
  const toggleGroup = (tools) => setAllowedTools((current) =>
    tools.every((tool) => current.includes(tool))
      ? current.filter((tool) => !tools.includes(tool))
      : [...new Set([...current, ...tools])],
  );
  return (
    <section className="grid keys-grid">
      <Panel title="API keys" wide>
        <div className="api-key-list-head">
          <span>{state?.keys?.length || 0} keys</span>
          <div className="api-key-toolbar">
            <Pill tone={openAccess ? "warn" : "ok"}>
              {openAccess ? "Open access" : "Authentication required"}
            </Pill>
            <button className="button primary" onClick={() => setCreating(true)}>Add API key</button>
          </div>
        </div>
        {creating && <div className="api-key-modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form
            className="api-key-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) mutate({ action: "create", name: name.trim(), allowedTools }, "API key created.");
            }}
          >
            <div className="api-key-modal-head">
              <div><b>Create API key</b><small>Name it and choose exactly what it can access.</small></div>
              <button type="button" className="clear" onClick={() => setCreating(false)}>Close</button>
            </div>
            <label className="api-key-name-field">
              <span>MCP key name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. production deploy" maxLength={80} autoFocus />
            </label>
            <div className="api-key-permissions-field">
              <span>Tool access</span>
              <details className="api-key-tools" open>
                <summary>{allowedTools.length === allTools.length ? "All tools allowed" : `${allowedTools.length} of ${allTools.length} tools allowed`}</summary>
                <div className="api-key-tool-groups">
                  <div className="api-key-tool-actions">
                    <button type="button" onClick={() => setAllowedTools(allTools)}>Allow all</button>
                    <button type="button" onClick={() => setAllowedTools([])}>Clear all</button>
                  </div>
                  {toolGroups.map((group) => (
                    <div className="api-key-tool-group" key={group.id}>
                      <Check
                        label={group.label}
                        checked={group.tools.every((tool) => allowedTools.includes(tool))}
                        onChange={() => toggleGroup(group.tools)}
                      />
                      <div className="api-key-tool-items">
                        {group.tools.map((tool) => (
                          <Check key={tool} label={tool} checked={allowedTools.includes(tool)} onChange={() => toggleTool(tool)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className="api-key-modal-actions">
              <button type="button" className="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="button primary" type="submit" disabled={!name.trim()}>Create API key</button>
            </div>
          </form>
        </div>}
        {secret && (
          <div className="secret">
            <b>Copy this key now. It cannot be shown again.</b>
            <code>{secret}</code>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setMessage("API key copied.");
                  setKind("ok");
                } catch {
                  setMessage("Copy failed. Select the key text manually.");
                  setKind("err");
                }
              }}
            >
              Copy key
            </button>
          </div>
        )}
        <div className="api-key-list">
          <div className="api-key-row api-key-heading">
            <span>Name</span>
            <span>Created</span>
            <span>Key</span>
            <span>Access</span>
            <span />
          </div>
          {state?.keys?.length
            ? state.keys.map((key) => (
                <div className="api-key-row" key={key.id}>
                  <b>{key.name}</b>
                  <time dateTime={new Date(key.createdAt).toISOString()}>{formatKeyDate(key.createdAt)}</time>
                  <code>{key.preview}</code>
                  <small>{key.allowedTools === null ? "all tools" : `${key.allowedTools.length} tools`}</small>
                  <button
                    className="button danger"
                    onClick={() =>
                      window.confirm(
                        "Revoke this API key? Clients using it will lose access immediately.",
                      ) && mutate({ action: "revoke", id: key.id }, "API key revoked.")
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))
            : state && <Empty>No API keys created.</Empty>}
        </div>
        <p className={`message ${kind}`}>{message}</p>
      </Panel>
    </section>
  );
}
