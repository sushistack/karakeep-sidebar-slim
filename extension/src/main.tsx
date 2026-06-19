import ReactDOM from "react-dom/client";

import "./index.css";

import { HashRouter, Route, Routes } from "react-router-dom";

import BookmarkDeletedPage from "./BookmarkDeletedPage.tsx";
import BookmarkSavedPage from "./BookmarkSavedPage.tsx";
import CustomHeadersPage from "./CustomHeadersPage.tsx";
import Layout from "./Layout.tsx";
import NotConfiguredPage from "./NotConfiguredPage.tsx";
import OptionsPage from "./OptionsPage.tsx";
import SavePage from "./SavePage.tsx";
import SidebarPage from "./SidebarPage.tsx";
import SignInPage from "./SignInPage.tsx";
import { isSidebarMode } from "./utils/mode.ts";
import { Providers } from "./utils/providers.tsx";

function App() {
  return (
    <div
      className={
        isSidebarMode ? "flex h-screen w-full flex-col p-4" : "w-96 p-4"
      }
    >
      <Providers>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<SavePage />} />
              <Route path="/sidebar" element={<SidebarPage />} />
              <Route
                path="/bookmark/:bookmarkId"
                element={<BookmarkSavedPage />}
              />
              <Route
                path="/bookmarkdeleted"
                element={<BookmarkDeletedPage />}
              />
            </Route>
            <Route path="/notconfigured" element={<NotConfiguredPage />} />
            <Route path="/options" element={<OptionsPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/customheaders" element={<CustomHeadersPage />} />
          </Routes>
        </HashRouter>
      </Providers>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
