import {
  BookmarkTypes,
  ZNewBookmarkRequest,
} from "@karakeep/shared/types/bookmarks";

import { clearBadgeStatus, getBadgeStatus } from "../utils/badgeCache";
import { hasSidebarLoginPermission } from "../utils/permissions";
import {
  getPluginSettings,
  Settings,
  subscribeToSettingsChanges,
} from "../utils/settings";
import { getApiClient, initializeClients } from "../utils/trpc";
import { MessageType } from "../utils/type";
import { isHttpUrl } from "../utils/url";
import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./protocol";

const COMPACT_CARDS_SCRIPT_ID = "compact-cards";

async function updateCompactCardScript(settings: Settings): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [COMPACT_CARDS_SCRIPT_ID],
    });
  } catch {
    // Script wasn't registered — ignore
  }

  if (!settings.compactCards || !settings.address) return;

  try {
    const origin = new URL(settings.address).origin;
    if (!(await hasSidebarLoginPermission(origin))) return;
    await chrome.scripting.registerContentScripts([
      {
        id: COMPACT_CARDS_SCRIPT_ID,
        matches: [`${origin}/*`],
        css: ["compact-cards.css"],
        js: ["compact-cards.js"],
        runAt: "document_idle",
      },
    ]);
  } catch {
    // Permissions not granted or scripting not available — skip silently
  }
}

// Update the sidebar panel URL to point directly at the Karakeep web app.
// This makes Karakeep load as a first-party top-level document instead of
// inside an iframe, which means Firefox State Partitioning and SameSite=Lax
// no longer apply — cookies (including HttpOnly session cookies) work normally.
async function updateSidebarPanel(settings: Settings): Promise<void> {
  const sidebarAction = (
    chrome as unknown as {
      sidebarAction?: {
        setPanel: (details: { panel: string | null }) => Promise<void>;
      };
    }
  ).sidebarAction;

  if (!sidebarAction) return;

  if (settings.address && settings.apiKey) {
    const browseUrl = `${settings.address.replace(/\/+$/, "")}/dashboard/search`;
    try {
      await sidebarAction.setPanel({ panel: browseUrl });
    } catch {
      // setPanel may reject external URLs on some builds — fall back to the
      // extension page, which will navigate via window.location.replace().
      await sidebarAction.setPanel({ panel: null });
    }
  } else {
    await sidebarAction.setPanel({ panel: null });
  }
}

const OPEN_KARAKEEP_ID = "open-karakeep";
const ADD_LINK_TO_KARAKEEP_ID = "add-link";
const CLEAR_CURRENT_CACHE_ID = "clear-current-cache";
const CLEAR_ALL_CACHE_ID = "clear-all-cache";
const SEPARATOR_ID = "separator-1";
const VIEW_PAGE_IN_KARAKEEP = "view-page-in-karakeep";

async function checkSettingsState(settings: Settings) {
  await initializeClients();
  if (settings?.address && settings?.apiKey) {
    registerContextMenus(settings);
  } else {
    removeContextMenus();
    await clearAllCache();
  }
  await updateSidebarPanel(settings);
  await updateCompactCardScript(settings);
}

function removeContextMenus() {
  try {
    chrome.contextMenus.removeAll();
  } catch (error) {
    console.error("Failed to remove context menus:", error);
  }
}

function registerContextMenus(settings: Settings) {
  removeContextMenus();
  chrome.contextMenus.create({
    id: OPEN_KARAKEEP_ID,
    title: "Open Karakeep",
    contexts: ["action"],
  });

  chrome.contextMenus.create({
    id: ADD_LINK_TO_KARAKEEP_ID,
    title: "Add to Karakeep",
    contexts: ["link", "page", "selection", "image"],
  });

  if (settings?.showCountBadge) {
    chrome.contextMenus.create({
      id: VIEW_PAGE_IN_KARAKEEP,
      title: "View this page in Karakeep",
      contexts: ["action", "page"],
    });
    if (settings?.useBadgeCache) {
      chrome.contextMenus.create({
        id: SEPARATOR_ID,
        type: "separator",
        contexts: ["action"],
      });

      chrome.contextMenus.create({
        id: CLEAR_CURRENT_CACHE_ID,
        title: "Clear Current Page Cache",
        contexts: ["action"],
      });

      chrome.contextMenus.create({
        id: CLEAR_ALL_CACHE_ID,
        title: "Clear All Cache",
        contexts: ["action"],
      });
    }
  }
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) {
  const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl } = info;
  if (menuItemId === OPEN_KARAKEEP_ID) {
    getPluginSettings().then((settings: Settings) => {
      chrome.tabs.create({ url: settings.address, active: true });
    });
  } else if (menuItemId === CLEAR_CURRENT_CACHE_ID) {
    await clearCurrentPageCache();
  } else if (menuItemId === CLEAR_ALL_CACHE_ID) {
    await clearAllCache();
  } else if (menuItemId === ADD_LINK_TO_KARAKEEP_ID) {
    const isCurrentPage = !srcUrl && !linkUrl;
    addLinkToKarakeep({
      selectionText,
      srcUrl,
      linkUrl,
      pageUrl,
      title: isCurrentPage ? tab?.title : undefined,
    });

    // NOTE: Firefox only allows opening context menus if it's triggered by a user action.
    // awaiting on any promise before calling this function will lose the "user action" context.
    await chrome.action.openPopup();
  } else if (menuItemId === VIEW_PAGE_IN_KARAKEEP) {
    if (tab) {
      await searchCurrentUrl(tab.url);
    }
  }
}

function addLinkToKarakeep({
  selectionText,
  srcUrl,
  linkUrl,
  pageUrl,
  title,
}: {
  selectionText?: string;
  srcUrl?: string;
  linkUrl?: string;
  pageUrl?: string;
  title?: string;
}) {
  let newBookmark: ZNewBookmarkRequest | null = null;
  if (selectionText) {
    newBookmark = {
      type: BookmarkTypes.TEXT,
      text: selectionText,
      sourceUrl: pageUrl,
      source: "extension",
    };
  } else {
    const finalUrl = srcUrl ?? linkUrl ?? pageUrl;

    if (finalUrl && isHttpUrl(finalUrl)) {
      newBookmark = {
        type: BookmarkTypes.LINK,
        url: finalUrl,
        source: "extension",
        title,
      };
    } else {
      console.warn("Invalid URL, bookmark not created:", finalUrl);
    }
  }
  if (newBookmark) {
    chrome.storage.session.set({
      [NEW_BOOKMARK_REQUEST_KEY_NAME]: newBookmark,
    });
  }
}

async function searchCurrentUrl(tabUrl?: string) {
  try {
    if (!tabUrl || !isHttpUrl(tabUrl)) {
      console.warn("Invalid URL, cannot search:", tabUrl);
      return;
    }
    console.log("Searching bookmarks for URL:", tabUrl);

    const settings = await getPluginSettings();
    const serverAddress = settings.address;

    const matchedBookmarkId = await getBadgeStatus(tabUrl);
    let targetUrl: string;
    if (matchedBookmarkId) {
      targetUrl = `${serverAddress}/dashboard/preview/${matchedBookmarkId}`;
      console.log("Opening bookmark details page:", targetUrl);
    } else {
      const searchQuery = encodeURIComponent(`url:${tabUrl}`);
      targetUrl = `${serverAddress}/dashboard/search?q=${searchQuery}`;
      console.log("Opening search results page:", targetUrl);
    }
    await chrome.tabs.create({ url: targetUrl, active: true });
  } catch (error) {
    console.error("Failed to search current URL:", error);
  }
}

async function clearCurrentPageCache() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab.url && activeTab.id) {
      console.log("Clearing cache for current page:", activeTab.url);
      await clearBadgeStatus(activeTab.url);
      await checkAndUpdateIcon(activeTab.id);
    }
  } catch (error) {
    console.error("Failed to clear current page cache:", error);
  }
}

async function clearAllCache() {
  try {
    console.log("Clearing all badge cache");
    await clearBadgeStatus();
  } catch (error) {
    console.error("Failed to clear all cache:", error);
  }
}

getPluginSettings().then(async (settings: Settings) => {
  await checkSettingsState(settings);
});

subscribeToSettingsChanges(async (settings) => {
  await checkSettingsState(settings);
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Manifest V3 allows async functions for all callbacks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

function handleCommand(command: string, tab: chrome.tabs.Tab) {
  if (command === ADD_LINK_TO_KARAKEEP_ID) {
    addLinkToKarakeep({
      selectionText: undefined,
      srcUrl: undefined,
      linkUrl: undefined,
      pageUrl: tab?.url,
    });

    chrome.action.openPopup();
  } else {
    console.warn(`Received unknown command: ${command}`);
  }
}

chrome.commands.onCommand.addListener(handleCommand);

export async function setBadge(badgeStatus: string | null, tabId?: number) {
  if (!tabId) return;

  if (badgeStatus) {
    return await Promise.all([
      chrome.action.setBadgeText({ tabId, text: ` ` }),
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#4CAF50",
      }),
    ]);
  } else {
    await chrome.action.setBadgeText({ tabId, text: `` });
  }
}

async function checkAndUpdateIcon(tabId: number) {
  const tabInfo = await chrome.tabs.get(tabId);
  const { showCountBadge } = await getPluginSettings();
  const api = await getApiClient();
  if (
    !api ||
    !showCountBadge ||
    !tabInfo.url ||
    !isHttpUrl(tabInfo.url) ||
    tabInfo.status !== "complete"
  ) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  console.log("Tab activated", tabId, tabInfo);

  try {
    const status = await getBadgeStatus(tabInfo.url);
    await setBadge(status, tabId);
  } catch (error) {
    console.error("Archive check failed:", error);
    await setBadge(null, tabId);
  }
}

chrome.tabs.onActivated.addListener(async (tabActiveInfo) => {
  await checkAndUpdateIcon(tabActiveInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
  await checkAndUpdateIcon(tabId);
});

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type) {
    if (msg.currentTab && msg.type === MessageType.BOOKMARK_REFRESH_BADGE) {
      console.log(
        "Received REFRESH_BADGE message for tab:",
        msg.currentTab.url,
      );
      if (msg.currentTab.url) {
        await clearBadgeStatus(msg.currentTab.url);
      }
      if (typeof msg.currentTab.id === "number") {
        await checkAndUpdateIcon(msg.currentTab.id);
      }
    }
  }
});
