import NotConfiguredPage from "./NotConfiguredPage";
import usePluginSettings from "./utils/settings";

// The sidebar panel URL is set to the Karakeep web app directly by the
// background script (updateSidebarPanel). This component is the fallback
// shown when that setPanel call didn't take (e.g. Firefox rejected the
// external URL), or while settings are still loading.
export default function SidebarPage() {
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();

  if (!isSettingsLoaded) {
    return null;
  }
  if (!settings.address || !settings.apiKey) {
    return <NotConfiguredPage />;
  }

  // Background script should have already redirected the panel via
  // sidebarAction.setPanel(). If we still end up here, navigate directly.
  const browseUrl = `${settings.address.replace(/\/+$/, "")}/dashboard/search`;
  window.location.replace(browseUrl);
  return null;
}
