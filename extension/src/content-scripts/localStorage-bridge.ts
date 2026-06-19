// Bridges the Karakeep web app's localStorage to chrome.storage.local so that
// login state survives sidebar panel reloads (browser restart, extension reload).
//
// Why this is needed: Firefox applies State Partitioning (Total Cookie Protection)
// to cross-origin iframes. localStorage inside the moz-extension:// sidebar iframe
// is partitioned to the extension origin and may be cleared between sessions.
// chrome.storage.local is reliable persistent storage that is unaffected by this.
//
// This content script only runs on URLs the user has explicitly granted access to
// (via the "Persist sidebar login" toggle in Options, which requests permission for
// just the configured Karakeep server origin).

const BACKUP_KEY = `ls_bridge_${location.origin}`;

// Restore backed-up localStorage before the Karakeep app initializes.
// chrome.storage.local.get resolves in <5ms (local IPC); the Next.js bundle
// download takes longer, so the restore always completes first in practice.
void chrome.storage.local.get(BACKUP_KEY).then((result) => {
  const backup = result[BACKUP_KEY] as Record<string, string> | undefined;
  if (!backup) return;
  for (const [key, value] of Object.entries(backup)) {
    // Don't overwrite keys already present (e.g. on a non-partitioned load)
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, value);
    }
  }
});

function save(): void {
  if (localStorage.length === 0) return;
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    data[key] = localStorage.getItem(key)!;
  }
  void chrome.storage.local.set({ [BACKUP_KEY]: data });
}

// Save periodically to capture SPA auth state changes without waiting for unload
const intervalId = setInterval(save, 10_000);

window.addEventListener("beforeunload", save);
window.addEventListener("pagehide", () => clearInterval(intervalId));
