import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRightFromSquare, Check } from "lucide-react";
import { Navigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import Spinner from "./Spinner";
import { isSidebarMode } from "./utils/mode";
import { hasHostPermission } from "./utils/permissions";
import usePluginSettings from "./utils/settings";
import {
  capturePageWithSingleFile,
  uploadSingleFileAsset,
} from "./utils/singlefile";
import { useTRPC } from "./utils/trpc";
import { MessageType } from "./utils/type";
import { isHttpUrl } from "./utils/url";

interface SavePageProps {
  // Sidebar composite calls this after a successful save so it can refresh
  // its iframe (the iframe doesn't see the bookmark creation otherwise).
  onSaved?: () => void;
}

export default function SavePage({ onSaved }: SavePageProps = {}) {
  const api = useTRPC();
  const { settings, isPending: isSettingsLoaded } = usePluginSettings();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const [pendingBookmark, setPendingBookmark] =
    useState<ZNewBookmarkRequest | null>(null);
  const [hasCheckedRequest, setHasCheckedRequest] = useState(false);
  // Sidebar mode collapses the confirmation UI to a single row by default so
  // the iframe below gets more vertical space. Toggled open when the user
  // wants to edit the title or add notes before saving.
  const [showDetails, setShowDetails] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | undefined>(
    undefined,
  );
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>(
    undefined,
  );

  const {
    data,
    mutate: createBookmark,
    reset: resetMutation,
    status,
  } = useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      onError: (e) => {
        setError("Something went wrong: " + e.message);
      },
      onSuccess: async () => {
        // After successful creation, update badge cache and notify background
        try {
          const [currentTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          await chrome.runtime.sendMessage({
            type: MessageType.BOOKMARK_REFRESH_BADGE,
            currentTab: currentTab,
          });
        } catch {
          // Badge refresh is best-effort — on Firefox Android the background
          // script may not be reachable from the popup context.
        }
        onSaved?.();
      },
    }),
  );

  useEffect(() => {
    async function getNewBookmarkRequestFromBackgroundScriptIfAny(): Promise<ZNewBookmarkRequest | null> {
      const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
        await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);
      if (!req) {
        return null;
      }
      // Delete the request immediately to avoid issues with lingering values
      await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);
      return zNewBookmarkRequestSchema.parse(req);
    }

    async function loadBookmarkRequest() {
      const [currentTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      setCurrentTabId(currentTab?.id);
      setCurrentTabUrl(currentTab?.url);

      let newBookmarkRequest =
        await getNewBookmarkRequestFromBackgroundScriptIfAny();
      if (!newBookmarkRequest) {
        if (!currentTab?.url) {
          setError("Current tab has no URL to bookmark.");
          setHasCheckedRequest(true);
          return;
        }

        if (!isHttpUrl(currentTab.url)) {
          setError(
            "Cannot bookmark this type of URL. Only HTTP/HTTPS URLs are supported.",
          );
          setHasCheckedRequest(true);
          return;
        }

        newBookmarkRequest = {
          type: BookmarkTypes.LINK,
          title: currentTab.title,
          url: currentTab.url,
          source: "extension",
        };
      }

      setPendingBookmark(newBookmarkRequest);
      setHasCheckedRequest(true);
    }

    if (!isSettingsLoaded) return;
    loadBookmarkRequest();

    if (!isSidebarMode) return;
    // The sidebar stays mounted across tab switches; refresh the candidate
    // bookmark when the user activates a different tab or the active tab
    // navigates so the confirmation UI tracks what they're actually looking
    // at instead of the tab that was active when the panel first opened.
    const refresh = () => loadBookmarkRequest();
    const onActivated = () => refresh();
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && changeInfo.url) refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [isSettingsLoaded]);

  const saveBookmark = async (bookmark: ZNewBookmarkRequest) => {
    let finalBookmark = bookmark;
    // Only crawl when the bookmark target matches the active tab — context-menu
    // saves (link/src URL) may create a bookmark for a different URL, in which
    // case capturing the current page would attach the wrong archive.
    if (
      settings.useSingleFile &&
      currentTabId !== undefined &&
      bookmark.type === BookmarkTypes.LINK &&
      !bookmark.precrawledArchiveId &&
      currentTabUrl !== undefined &&
      bookmark.url === currentTabUrl &&
      // The `<all_urls>` host permission is optional and only granted when the
      // user opts in to client-side crawling; it may have been revoked since.
      (await hasHostPermission())
    ) {
      try {
        setIsCapturing(true);
        const html = await capturePageWithSingleFile(currentTabId, {
          includeImages: settings.singleFileIncludeImages,
        });
        const precrawledArchiveId = await uploadSingleFileAsset(
          html,
          bookmark.title ?? undefined,
        );
        finalBookmark = { ...bookmark, precrawledArchiveId };
      } catch (e) {
        // Client-side crawling is best-effort — fall back to a plain bookmark
        // so users can still save links on pages where capture is blocked.
        console.warn("Client-side crawl failed, saving without archive:", e);
      } finally {
        setIsCapturing(false);
      }
    }
    createBookmark({
      ...finalBookmark,
      source: finalBookmark.source || "extension",
    });
  };

  // Auto-save when settings are loaded and we have a pending bookmark
  useEffect(() => {
    if (
      hasCheckedRequest &&
      pendingBookmark &&
      settings.autoSave &&
      !isSidebarMode &&
      status === "idle" &&
      !isCapturing &&
      !error
    ) {
      saveBookmark(pendingBookmark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCheckedRequest,
    pendingBookmark,
    settings.autoSave,
    status,
    isCapturing,
    error,
  ]);

  const handleManualSave = () => {
    if (pendingBookmark) {
      saveBookmark(pendingBookmark);
    }
  };

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (isCapturing) {
    return (
      <div className="flex justify-between text-lg">
        <span>Capturing Page </span>
        <Spinner />
      </div>
    );
  }

  switch (status) {
    case "error": {
      return <div className="text-red-500">{error}</div>;
    }
    case "success": {
      if (isSidebarMode) {
        // In sidebar mode the iframe below renders the full bookmark UI, so
        // skip navigating to BookmarkSavedPage. Show a compact confirmation
        // and let the user save another page without unmounting the iframe.
        return (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="w-4" />
              Saved
            </span>
            <div className="flex items-center gap-2">
              <a
                href={`${settings.address}/dashboard/preview/${data.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-foreground underline"
              >
                <ArrowUpRightFromSquare className="w-3" />
                Open
              </a>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  resetMutation();
                  setShowDetails(false);
                }}
              >
                Save another
              </Button>
            </div>
          </div>
        );
      }
      return <Navigate to={`/bookmark/${data.id}`} />;
    }
    case "pending": {
      return (
        <div className="flex justify-between text-lg">
          <span>Saving Bookmark </span>
          <Spinner />
        </div>
      );
    }
    case "idle": {
      // Show confirmation UI when autoSave is disabled
      if (
        !(settings.autoSave && !isSidebarMode) &&
        pendingBookmark &&
        hasCheckedRequest
      ) {
        const compact = isSidebarMode && !showDetails;
        if (compact) {
          // Single-row save UI for the sidebar so the iframe below gets the
          // bulk of the vertical space. The chevron expands inline editors
          // when the user wants to set a title or add notes.
          const label =
            pendingBookmark.type === BookmarkTypes.LINK
              ? (pendingBookmark.title ?? pendingBookmark.url)
              : pendingBookmark.type === BookmarkTypes.TEXT
                ? pendingBookmark.text
                : (pendingBookmark.title ??
                  pendingBookmark.fileName ??
                  "Asset");
          return (
            <div className="flex flex-col gap-2">
              <p className="truncate text-xs text-muted-foreground">{label}</p>
              <div className="flex gap-2">
                <Button onClick={handleManualSave} className="flex-1">
                  Save bookmark
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowDetails(true)}
                  title="Edit title and notes"
                >
                  Edit
                </Button>
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-medium">Save Bookmark?</p>
            {pendingBookmark.type === BookmarkTypes.LINK && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <Input
                  value={pendingBookmark.title ?? ""}
                  onChange={(e) =>
                    setPendingBookmark((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  placeholder="Untitled"
                />
                <p className="truncate text-xs text-muted-foreground">
                  {pendingBookmark.url}
                </p>
              </div>
            )}
            {pendingBookmark.type === BookmarkTypes.TEXT && (
              <p className="text-xs text-muted-foreground">
                {pendingBookmark.text.length > 150
                  ? `${pendingBookmark.text.substring(0, 150)}...`
                  : pendingBookmark.text}
              </p>
            )}
            {pendingBookmark.type === BookmarkTypes.ASSET && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <Input
                  value={pendingBookmark.title ?? ""}
                  onChange={(e) =>
                    setPendingBookmark((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  placeholder={pendingBookmark.fileName ?? "Asset"}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Notes
              </label>
              <Textarea
                value={pendingBookmark.note ?? ""}
                onChange={(e) =>
                  setPendingBookmark((prev) =>
                    prev ? { ...prev, note: e.target.value } : prev,
                  )
                }
                placeholder="Add notes..."
                className="h-20 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleManualSave} className="flex-1">
                Save Bookmark
              </Button>
              {isSidebarMode && (
                <Button
                  variant="secondary"
                  onClick={() => setShowDetails(false)}
                  title="Collapse details"
                >
                  Hide
                </Button>
              )}
            </div>
          </div>
        );
      }
      return (
        <div className="flex justify-between text-lg">
          <span>Saving Bookmark </span>
          <Spinner />
        </div>
      );
    }
  }
}
