# AGENTS.md

Guidance for AI coding agents (Claude, Copilot, Cursor, etc.) working in this
repository. Follow this alongside any tool-specific config, and keep this
file updated when conventions change.

## What this is

"What's That Font" is a Manifest V3 Chrome extension. Hovering over any
element while the inspector is active shows a cursor-following tooltip with
that element's computed font family, size, and weight. No build step, no
bundler, no dependencies — the four extension source files are shipped as-is.

## File map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: permissions, content script registration, commands, icons. |
| `background.js` | Service worker. Owns per-tab active/inactive state, the toolbar badge, and the toggle keyboard command. |
| `content.js` | Injected into every page (`<all_urls>`, `document_idle`). Owns hover detection, tooltip DOM/content, and the on-page toast. |
| `tooltip.css` | Styles for `#__fontTooltip` (injected via `content_scripts`, so it must not leak selectors into host pages). |
| `preview.html` | Standalone GitHub-README preview page for local use only. Not part of the shipped extension — not referenced by `manifest.json`. |
| `icons/` | Toolbar/store icons (16/48/128). |

There is no `package.json`, no test runner, and no lint config. Don't add
one speculatively — if you introduce tooling, explain why in the PR/commit
and keep it minimal.

## Architecture invariants

Read these before touching `background.js` or `content.js` — they encode
decisions made after earlier bugs/reviews, not arbitrary style.

1. **Background is the source of truth for on/off state.** Per-tab state
   lives in `chrome.storage.session` under the `activeTabs` key (see
   `getActiveTabs`/`setTabActive` in `background.js`). `content.js` does
   **not** keep its own authoritative state across page loads — on every
   fresh injection it asks the background worker via
   `chrome.runtime.sendMessage({ action: "getState" })` and restores
   silently. Do not reintroduce a `window.__fontInspectorActive`-style
   global as the source of truth; it doesn't survive navigation.
2. **Toggling goes through `background.js`'s `toggleTab`**, which sends an
   explicit `{ action: "setActive", active: boolean }` message — never a
   bare `{ action: "toggle" }`. The explicit boolean lets both the badge and
   the content script agree on state without a race.
3. **The toolbar badge mirrors state per tab** (`updateBadge` in
   `background.js`). If you change how state is toggled, update the badge
   in the same code path — don't let them drift.
4. **Clean up `chrome.storage.session` on tab close** (`chrome.tabs.onRemoved`).
   Any new per-tab state must be cleaned up the same way to avoid unbounded
   growth across a long browser session.
5. **Content script injection has a fallback path.** `toggleTab` first tries
   `chrome.tabs.sendMessage`; if that fails with "Receiving end does not
   exist" / "Could not establish connection" (tab opened before install, or
   a page the declarative content script never ran on), it falls back to
   `chrome.scripting.executeScript` + `insertCSS` then retries the message.
   Preserve both paths and the `window.__whatsThatFontInitialized` guard at
   the top of `content.js` — without it, the fallback path can double-inject.
6. **Tooltip positioning is rAF-throttled**, not per-event. `mousemove` and
   `scroll` handlers stash pending coordinates and call `scheduleUpdate()`,
   which coalesces to one `requestAnimationFrame` callback. This exists
   because `positionTooltip()` calls `getBoundingClientRect()`, which forces
   a synchronous layout — doing that on every raw event caused measurable
   jank. Do not revert to calling `positionTooltip` directly from the event
   handlers. Any new per-frame DOM read/write should go through the same
   `scheduleUpdate`/`cancelScheduledUpdate` pair (see `content.js`), not a
   second, independent rAF loop.
7. **All rendered text goes through `escapeHtml`.** Font family/size/weight
   values originate from page-controlled CSS and are inserted via
   `tooltip.innerHTML`. Never interpolate a computed-style value into that
   template without `escapeHtml` first.

## Conventions

- Plain ES2020+ JavaScript, no TypeScript, no framework, no transpilation.
  Code must run unmodified as loaded by Chrome.
- 2-space indentation, double quotes, semicolons — match the existing files.
- Comments are rare and reserved for *why*, not *what* (e.g. why rAF
  throttling exists, why a guard flag is needed) — see existing files for
  the calibration. Don't add narrating comments.
- Keep permissions in `manifest.json` minimal. This extension deliberately
  uses `activeTab` + a declarative `<all_urls>` content script instead of
  broad `host_permissions`; don't add scopes (e.g. `tabs`, `webNavigation`)
  without a concrete need tied to a specific feature.
- No external network calls, analytics, or remote code from `background.js`
  or `content.js`. (`preview.html` loading a CDN stylesheet is fine — it's
  dev-only tooling, not shipped in the extension.)

## Testing / verification

There's no automated test suite. Before calling a change done:

1. Sanity-check syntax: `node --check background.js` and
   `node --check content.js`.
2. Manually verify in Chrome: `chrome://extensions` → Developer mode →
   "Load unpacked" → select this directory. Then check:
   - Toggling via the toolbar icon and via `Ctrl+Shift+F`/`Cmd+Shift+F`.
   - Badge shows `ON` when active, clears when inactive.
   - State survives a full page navigation/reload in the same tab.
   - State does not leak to other tabs.
   - Tooltip content updates correctly on hover and stays on-screen near
     viewport edges.
3. If you touched `background.js`'s injection fallback, test on a tab that
   was already open before reloading the extension (this is the only path
   that exercises `chrome.scripting.executeScript`).

## Out of scope unless asked

Don't add a build system, bundler, TypeScript, or test framework as part of
an unrelated change. Don't add options pages, storage of user preferences
beyond per-tab active state, or telemetry unless explicitly requested.
