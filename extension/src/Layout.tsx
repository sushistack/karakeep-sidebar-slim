import { ArrowLeft, Home, RefreshCw, Settings, X } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { isSidebarMode } from "./utils/mode";
import usePluginSettings from "./utils/settings";

export default function Layout() {
  const navigate = useNavigate();
  const { settings, isPending: isInit } = usePluginSettings();
  if (!isInit) {
    return <div className="p-4">Loading ... </div>;
  }

  if (!settings.apiKey || !settings.address) {
    navigate("/notconfigured");
    return;
  }

  return (
    <div
      className={
        isSidebarMode
          ? "flex min-h-0 flex-1 flex-col space-y-2"
          : "flex flex-col space-y-2"
      }
    >
      <div
        className={
          isSidebarMode
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-gray-100 p-4 dark:bg-gray-900"
            : "rounded-md bg-gray-100 p-4 dark:bg-gray-900"
        }
      >
        <Outlet />
      </div>
      <hr />
      <div className="flex justify-between space-x-3">
        <div className="my-auto">
          <a
            className="flex gap-2 text-foreground"
            target="_blank"
            rel="noreferrer"
            href={`${settings.address}/dashboard/search`}
          >
            <Home />
            <span className="text-md my-auto">Search</span>
          </a>
        </div>
        <div className="flex space-x-3">
          {isSidebarMode && (
            <Button
              onClick={() => navigate("/sidebar")}
              title="Back to bookmarks list"
            >
              <ArrowLeft className="w-4" />
            </Button>
          )}
          {process.env.NODE_ENV == "development" && (
            <Button onClick={() => navigate(0)}>
              <RefreshCw className="w-4" />
            </Button>
          )}
          <Button onClick={() => navigate("/options")}>
            <Settings className="w-4" />
          </Button>
          {!isSidebarMode && (
            <Button onClick={() => window.close()}>
              <X className="w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
