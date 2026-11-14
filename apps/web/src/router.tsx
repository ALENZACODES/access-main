import { createBrowserRouter } from "react-router-dom";
import { AboutPage } from "./pages/AboutPage.tsx";
import { DataStatusPage } from "./pages/DataStatusPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { ModulePage } from "./pages/ModulePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OfflinePackPage } from "./pages/OfflinePackPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { AppShell } from "./shell/AppShell.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "about", element: <AboutPage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "data-status", element: <DataStatusPage /> },
      { path: "offline", element: <OfflinePackPage /> },
      { path: "places", element: <ModulePage id="places" /> },
      { path: "journey", element: <ModulePage id="journey" /> },
      { path: "finders", element: <ModulePage id="finders" /> },
      { path: "navigator", element: <ModulePage id="navigator" /> },
      { path: "games", element: <ModulePage id="games" /> },
      { path: "help", element: <HelpPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
