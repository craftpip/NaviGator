# Devtools tools must never mislead the LLM

## The incident

An agent tried to log in to the Paddock admin UI (`http://10.69.1.164:6789/login`)
using `Input.insertText` with `selector=input[name='password']`. The tool failed
with `Could not resolve element for Input.insertText`.

It looked like the agent's fault at first — the inputs genuinely have no `name`
attributes. But the agent was misled by our own tooling. `DOM.getDocument` had
reported `name: "password"` on the password field. That attribute never existed
in the DOM. The tool fabricated it, the agent trusted it, and the login failed.

The root cause of the phantom attribute was a **stale server process**: the
navigator container had been running for 2 days without a restart, serving
in-memory modules that did not match the files on disk (it was still serving the
reverted JSON-era `web_fetch` description, for example). The working-tree code
was always accurate — a verbatim inline reproduction of the same evaluation
returned `name: ""`.

Two bugs, one lesson:

1. A stale long-running process can serve behavior that the current code does not
   have. Restart before debugging.
2. The tool output that misled the agent was itself a fidelity bug: attribute
   descriptors reported empty-string defaults for attributes that were not
   present. Empty-string attributes are indistinguishable from real empty
   attributes, and after the stale process added a phantom value, nothing in the
   contract could catch it.

## The rule

**Devtools tool output must only ever describe what is real.** Never fabricate
attributes, never return silent truncation, never fail with a bare
"could not resolve element" message. When a tool fails, the error should tell
the LLM what it attempted, where, and what is actually there so it can recover.

## Changes made (src/devtools.js)

### Real attributes only

`DOM.getDocument`, `DOM.querySelector`, and `Runtime.evaluate` used to report a
hardcoded attribute object (`id`, `class`, `name`, `type`, `href`, `placeholder`)
with empty-string defaults. That is what fabricated `name: "password"`.

All three now iterate the element's real `attributes` (an `elementAttributes`
helper) and report only what exists, plus a `value` field for form fields. If an
attribute is absent, it is absent — the LLM can see exactly what selectors will
work.

### Actionable resolve failures

When a selector/xpath matches nothing, the error now includes:

- the tool name and the exact selector/xpath attempted,
- the page URL and title,
- a list of the elements actually present (tag + real attributes), tailored per
  tool — editable elements for `Input.insertText`, clickable elements for
  `Input.dispatchMouseEvent`, interactive elements for `DOM.scrollIntoViewIfNeeded`,
- a pointer to `DOM.getDocument`.

`DOM.getOuterHTML` / `DOM.getCompactHTML` failures include the URL/title and the
same pointer. The messages end with the old generic "Could not resolve element"
text as the prefix so existing error handling keeps working.

### No silent truncation

- Text fields are truncated with a `...` ellipsis instead of a silent `.slice()`.
- `Runtime.evaluate` serialize appends `[+N more]` / `[+more keys]` markers when
  arrays/objects are cut at 25.
- `DOM.getOuterHTML` / `DOM.getCompactHTML` return a `truncated: true/false`
  flag alongside the `...`-suffixed HTML.

### Truthful behavior reporting

- `Page.navigate` returns `created: true/false` so the LLM knows an implicit
  target was created.
- `Input.insertText` returns `focused`, `clearedExistingValue`, and `finalValue`
  (the element's value read back after typing), so the LLM can confirm the text
  actually landed. It reports `readonly`/`disabled` state from the element too.
- All tool descriptions were updated to state these behaviors (real attrs only,
  5-min target auto-close, readback fields, failure diagnostics).

## Verification

- Full test suite: 350 passed, 24 skipped (8 files + 1 skipped).
- 4 new regression tests in `tests/devtools.test.js` cover the insertText
  readback fields, insertText failure diagnostics, and getOuterHTML failure
  diagnostics.
- Live check against `http://10.69.1.164:6789/login` after `docker restart navigator`:
  - `DOM.getDocument` no longer reports `name` on the password input (real
    attrs: `type="password"`, `placeholder="Enter password"`).
  - `Input.insertText` with `input[name='password']` fails with the URL, page
    title, and the two actual editable inputs listed.
  - `Input.insertText` with `input[type='password']` succeeds and returns
    `finalValue: "admin"`.

## Keeping it that way

- Restart the navigator container after any code change: `docker restart navigator`.
  A container that has been up for days is running stale modules; verify against
  the live endpoint, not the disk state.
- When writing or extending devtools tools: attributes must come from
  `element.attributes`, truncation must be marked, and every resolve failure
  must include what was attempted, where, and what is actually on the page.
