// Sidebar mode is sticky for the lifetime of this document: the panel is
// loaded once with `#/sidebar` (see sidebar_action.default_panel in
// manifest.json), and subsequent hash navigations (e.g. /bookmark/:id) must
// not flip the UI back into popup layout.
export const isSidebarMode =
  typeof window !== "undefined" && window.location.hash.startsWith("#/sidebar");
