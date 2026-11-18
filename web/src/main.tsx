import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import Journal, { Credits } from "./pages/Journal";
import { Earnings, MyVoice } from "./pages/Owner";
import Passport, { Verify } from "./pages/Passport";
import Studio from "./pages/Studio";
import Voices from "./pages/Voices";
import { useStore } from "./state/store";
import { Shell } from "./ui/Shell";

function Home() {
  const persona = useStore((s) => s.persona);
  return <Navigate to={persona === "owner" ? "/ma-voix" : "/studio"} replace />;
}

const router = createBrowserRouter([
  { path: "/verifier", element: <Verify /> },
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/studio", element: <Studio /> },
      { path: "/voix", element: <Voices /> },
      { path: "/passeport", element: <Passport /> },
      { path: "/journal", element: <Journal /> },
      { path: "/jetons", element: <Credits /> },
      { path: "/ma-voix", element: <MyVoice /> },
      { path: "/revenus", element: <Earnings /> },
      { path: "*", element: <Home /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
