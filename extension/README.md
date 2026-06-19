# Karakeep Browser Extension — Sidebar Fork

Fork of the upstream Karakeep browser extension that exposes the same save
flow as a **Firefox sidebar panel** in addition to the existing toolbar
popup.

## What changed vs. upstream

- `manifest.json`: added `sidebar_action` pointing to `index.html#/sidebar`,
  a `_execute_sidebar_action` keyboard command (default `Ctrl+Shift+K`),
  and `frame-src https:` in the extension CSP so the sidebar can iframe a
  Karakeep web instance.
- `src/utils/mode.ts`: new module that captures sidebar context at load time
  by inspecting `window.location.hash`. The flag is sticky for the document
  lifetime so navigations like `/bookmark/:id` don't flip the UI back to
  popup layout.
- `src/SidebarPage.tsx`: composite view rendered at `/sidebar`. A compact
  "Save current page" panel on top + Karakeep web UI in an iframe below
  (browse / search / tags / lists). The iframe gets refreshed after each
  save via an `onSaved` callback on `SavePage`.
- `src/SavePage.tsx`: optional `onSaved` prop, tab-change listeners that
  refresh the candidate bookmark in sidebar mode, inline success state
  (instead of `<Navigate />`) so the iframe stays mounted, and a
  collapsible compact form (single Save row by default; "Edit" expands
  title / notes inputs).
- `src/Layout.tsx`: hides the window-close button in sidebar mode (no-op
  there) and adds a back-arrow that returns to `/sidebar` from
  Layout-wrapped routes.
- `src/OptionsPage.tsx`: adds a top-level **Back** button in sidebar mode
  since `/options` is not Layout-wrapped.

## Iframe authentication (SameSite cookies)

The sidebar iframes your Karakeep web UI to give you browse / search for
free. Karakeep uses NextAuth v4, which defaults its session cookie to
`SameSite=Lax` — that cookie is **not** sent inside cross-site iframes,
so the iframe appears stuck on the sign-in page even when you're logged
in on a normal tab.

For a Cloudflare-fronted self-hosted instance, the simplest fix is a
Worker that rewrites `Set-Cookie` on the way out. Create a Worker route
matching `<your-karakeep-host>/*` and deploy:

```js
// karakeep-samesite-rewrite.worker.js
export default {
  async fetch(request) {
    const upstream = await fetch(request);
    const setCookies =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : [];
    if (setCookies.length === 0) return upstream;

    const res = new Response(upstream.body, upstream);
    res.headers.delete("Set-Cookie");
    for (const cookie of setCookies) {
      const isAuthCookie =
        /^(?:__Secure-|__Host-)?next-auth\./i.test(cookie) ||
        /^(?:__Secure-|__Host-)?authjs\./i.test(cookie);
      if (!isAuthCookie) {
        res.headers.append("Set-Cookie", cookie);
        continue;
      }
      let rewritten = cookie
        .replace(/;\s*SameSite=Lax/gi, "")
        .replace(/;\s*SameSite=Strict/gi, "");
      if (!/;\s*SameSite=/i.test(rewritten)) {
        rewritten += "; SameSite=None";
      }
      if (!/;\s*Secure/i.test(rewritten)) {
        rewritten += "; Secure";
      }
      res.headers.append("Set-Cookie", rewritten);
    }
    return res;
  },
};
```

After the Worker is live, sign in on a regular Karakeep tab once — the
session cookie set during that sign-in flow will be `SameSite=None`,
which is then delivered to the iframe.

If you don't use Cloudflare, the alternatives are (a) patching
`apps/web/server/auth.ts` to add an explicit `cookies` block to the
NextAuth options or (b) rewriting `Set-Cookie` headers in your reverse
proxy (nginx `proxy_cookie_flags` etc.).

Chrome is unaffected: `sidebar_action` is a Firefox-specific manifest key
that Chrome silently ignores. The Chrome `side_panel` API can be added
later if needed.

## Build

From the repo root:

```sh
pnpm install
cd apps/browser-extension
VITE_BUILD_FIREFOX=1 pnpm build
```

Output ends up in `apps/browser-extension/dist/`.

## Load in Firefox (temporary install)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Pick `apps/browser-extension/dist/manifest.json`.
4. Open the sidebar via **View → Sidebar → Karakeep** or `Ctrl+Shift+K`.
5. First run: open the toolbar action to configure the server address and
   API key in Options. Self-hosted and `karakeep.app` cloud both work.

## Dev

```sh
cd apps/browser-extension
VITE_BUILD_FIREFOX=1 pnpm dev
```

Reload the temporary add-on from `about:debugging` after the bundler
rebuilds.

## Syncing upstream

```sh
git fetch upstream
git rebase upstream/main
VITE_BUILD_FIREFOX=1 pnpm build   # smoke test
```

Conflict surface is small — the sidebar changes touch `manifest.json`,
`main.tsx`, `Layout.tsx`, and add `utils/mode.ts`.
