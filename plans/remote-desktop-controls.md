# Remote Desktop Controls

## Goal

Replace the console header's VNC wording and independent controls with one clear
Remote Desktop flow:

1. When remote desktop is off, show only `Enable Remote Desktop`.
2. Clicking it enables the existing VNC/noVNC runtime stack.
3. Once it is running, replace that control with an adjacent button group:
   `Open Remote Desktop` on the left and `Close Remote Desktop` on the right.

This is a console UI terminology and state-presentation change. The server's
existing VNC runtime manager, endpoints, environment variables, and noVNC URL
remain unchanged.

## Current State

- `web-console/src/main.jsx` renders two independent header controls whenever
  `toggleVnc` is supplied:
  - `Enable VNC` / `Disable VNC`, based on `vnc.running`.
  - `Open VNC`, always rendered but disabled until `vnc.running` is true.
- `App.toggleVnc()` already sends `POST /console/vnc` with `enable` or `disable`
  based on the current `health.vnc.running` state.
- The running noVNC page is opened at
  `http://${location.hostname}:${vnc.novncPort}/vnc.html`.
- `.button`, `.button.vnc-on`, and `.button.danger` already provide the base
  header button styles in `web-console/src/style.css`; there is no button-group
  style today.

## UI Contract

| Runtime state | Visible controls | Behavior |
|---|---|---|
| Remote desktop off | `Enable Remote Desktop` | Starts the existing runtime VNC stack. |
| Enable/close request pending | One disabled button with the current `Working...` status | Prevents duplicate state-changing requests. |
| Remote desktop running | `Open Remote Desktop` + `Close Remote Desktop` grouped together | Open launches noVNC in a new tab. Close disables the existing runtime VNC stack. |

- Use **Remote Desktop** in all user-facing labels. Do not rename backend
  identifiers, API fields, environment variables, or server log terminology:
  those remain VNC/noVNC.
- The grouped running controls must stay adjacent and in this order: open left,
  close right.
- `Close Remote Desktop` is the destructive/state-changing action and should use
  the existing danger styling.
- Do not render a disabled `Open Remote Desktop` control while the service is
  off; it appears only after the service is ready.
- Preserve the existing `window.open()` target, `noopener` behavior, and port
  selection.

## Implementation

1. Update the VNC controls in `Layout` in `web-console/src/main.jsx`.
   - Branch on `vnc?.running` rather than always rendering both buttons.
   - Off state: render `Enable Remote Desktop` wired to the existing
     `toggleVnc` callback.
   - Running state: render a semantic wrapper such as `.remote-desktop-actions`
     containing `Open Remote Desktop` and `Close Remote Desktop`.
   - The close button uses the same `toggleVnc` callback because its current
     state-driven implementation already posts `action: "disable"`.
   - Keep both running-state actions disabled while `vncBusy` is true. The open
     action may remain available during an enable request only after the next
     health poll confirms `vnc.running`.

2. Add compact button-group styling in `web-console/src/style.css`.
   - Keep both controls in one visual group and avoid a gap between their shared
     edges.
   - Round only the outer corners so the controls visibly read as one group.
   - Preserve the header's existing responsive wrapping behavior; at narrow
     widths, the group may wrap as a unit but its two buttons must remain
     adjacent and ordered.
   - Ensure keyboard focus remains clearly visible for each button.

3. Update any console-facing wording or plan references that describe this
   header interaction as an active VNC control, where it would otherwise
   contradict the shipped UI. Do not rename technical documentation about the
   VNC/noVNC implementation.

## Verification

1. Run `npm run lint` and `npm run console:build`.
2. Start the console and verify desktop and narrow mobile widths in a browser.
3. With `vnc.running=false`, confirm only `Enable Remote Desktop` is visible.
4. Enable it and confirm the pending state prevents repeat clicks; after health
   polling reports it ready, confirm the enable control is replaced by the
   grouped open/close controls.
5. Click `Open Remote Desktop` and verify it opens the existing noVNC URL in a
   new tab.
6. Click `Close Remote Desktop`, confirm the controls return to the sole enable
   action after the disable request succeeds, and confirm the existing VNC
   enable/disable round trip still works.
