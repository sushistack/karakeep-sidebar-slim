# karakeep-sidebar (slim)

Firefox sidebar extension for [Karakeep](https://github.com/karakeep-app/karakeep), built as a thin
overlay on top of the upstream monorepo. **You only develop `extension/`.** Upstream stays pristine
as a git submodule, and CI assembles + releases.

## Layout

```
extension/   # the sidebar source (the only thing you edit)
upstream/    # git submodule -> karakeep-app/karakeep, pinned to a release tag
scripts/     # overlay.sh — symlinks extension/ into upstream as @karakeep/browser-extension
.github/     # build (PR), release (manual tag), auto-release (weekly cron)
```

The sidebar only consumes a handful of stable `@karakeep/*` workspace packages (shared types,
shared-react hooks, the tRPC `AppRouter` type). It modifies nothing in upstream, so overlaying onto
a pristine checkout is safe.

## Local development

```bash
git clone --recurse-submodules <this repo>
cd karakeep-sidebar
./scripts/overlay.sh                       # symlink extension/ into upstream
cd upstream && pnpm install --no-frozen-lockfile
pnpm --filter @karakeep/browser-extension dev
```

Edits in `extension/` are live through the symlink — there is one source of truth.

## Releasing

- **Automatic (weekly):** `auto-release.yml` runs every Monday. It bumps the upstream submodule to
  its latest release tag, rebuilds, and — only if the build + AMO signing both pass — bumps the
  manifest patch version, tags, and publishes a signed `.xpi`. If anything breaks, it pings ntfy and
  releases nothing.
- **Manual:** bump `extension/manifest.json`, then `git tag vX.Y.Z && git push --tags`.

## Required secrets

| Secret | Purpose |
|---|---|
| `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` | AMO signing |
| `NTFY_URL` | full ntfy topic URL, e.g. `https://ntfy.sh/your-secret-topic`, for failure alerts |
