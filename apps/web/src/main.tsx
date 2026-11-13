import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { initI18n } from "./i18n/index.ts";
import { ProfileProvider } from "./profile/ProfileProvider.tsx";
import { router } from "./router.tsx";
import "./styles/global.css";

initI18n();

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
  <StrictMode>
    <ProfileProvider>
      <RouterProvider router={router} />
    </ProfileProvider>
  </StrictMode>,
);
