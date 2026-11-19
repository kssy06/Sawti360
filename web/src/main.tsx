import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Forgot, Login, Signup } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import { BACKEND } from "./lib/backend";
import * as remoteBootstrap from "./state/remote/bootstrap";
import { onRemoteError } from "./state/remote/report";
import * as remoteSession from "./state/remote/session";
import { useStore } from "./state/store";
import { FullLoader } from "./ui/Loader";
import { toast } from "./ui/kit";
import { installPressRipple } from "./ui/motion";
import { Shell } from "./ui/Shell";

/* Heavier screens are split into their own chunks and load on demand behind a loading screen. */
const pick = <M, K extends keyof M>(load: () => Promise<M>, key: K) => lazy(() => load().then((m) => ({ default: m[key] as ComponentType })));
const Landing = lazy(() => import("./pages/Landing"));
const Workspace = lazy(() => import("./pages/project/Workspace"));
const NewProject = lazy(() => import("./pages/NewProject"));
const Library = lazy(() => import("./pages/Library"));
const Trust = lazy(() => import("./pages/Trust"));
const Requests = lazy(() => import("./pages/Requests"));
const Payments = pick(() => import("./pages/Requests"), "Payments");
const passport = () => import("./pages/Passport");
const VideoPassports = pick(passport, "VideoPassports");
const PassportView = pick(passport, "PassportView");
const Verify = pick(passport, "Verify");
const owner = () => import("./pages/Owner");
const OwnerHome = pick(owner, "OwnerHome");
const MyVoicePassport = pick(owner, "MyVoicePassport");
const OwnerRequests = pick(owner, "OwnerRequests");
const OwnerProfile = pick(owner, "OwnerProfile");
const OwnerRules = pick(owner, "OwnerRules");
const OwnerEarnings = pick(owner, "OwnerEarnings");
const publicPages = () => import("./pages/PublicResponses");
const ConsentPage = pick(publicPages, "ConsentPage");
const LicenseResponsePage = pick(publicPages, "LicenseResponsePage");

/** Public pages have no shell, so they get a full-screen loader. */
const Public = ({ page: Page }: { page: LazyExoticComponent<ComponentType> }) => (
  <Suspense fallback={<FullLoader />}>
    <Page />
  </Suspense>
);

installPressRipple();

/* Back-end mode: restore the Supabase session (if any) and load the account's data; reload it when the tab comes back. */
if (BACKEND) {
  void remoteSession.restore(useStore.setState, useStore.getState);
  onRemoteError((message) => toast(message, "bad"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") remoteBootstrap.refreshOnReturn(useStore.setState, useStore.getState);
  });
}

/** Public consent and licence pages may be answered in another tab: keep every tab in sync. */
window.addEventListener("storage", (e) => {
  if (e.key === "sawti360-demo") void useStore.persist.rehydrate();
});

function Home() {
  const persona = useStore((s) => s.persona);
  return <Navigate to={persona === "owner" ? "/proprietaire" : "/tableau-de-bord"} replace />;
}
function LegacyStudio() {
  const { id } = useParams();
  return <Navigate to={id ? `/projet/${id}/traduction` : "/projets"} replace />;
}
function ProjectIndex() {
  const { id } = useParams();
  return <Navigate to={`/projet/${id}/analyse`} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <Public page={Landing} /> },
  { path: "/connexion", element: <Login /> },
  { path: "/inscription", element: <Signup /> },
  { path: "/mot-de-passe-oublie", element: <Forgot /> },
  { path: "/verifier", element: <Public page={Verify} /> },
  { path: "/consentement/:token", element: <Public page={ConsentPage} /> },
  { path: "/licence/:token", element: <Public page={LicenseResponsePage} /> },
  {
    element: <Shell />,
    children: [
      { path: "/tableau-de-bord", element: <Dashboard /> },
      { path: "/projets", element: <Projects /> },
      { path: "/nouveau", element: <NewProject /> },
      { path: "/projet/:id", element: <ProjectIndex /> },
      { path: "/projet/:id/:step", element: <Workspace /> },
      { path: "/bibliotheque", element: <Library /> },
      { path: "/demandes", element: <Requests /> },
      { path: "/passeports", element: <VideoPassports /> },
      { path: "/passeports/:id", element: <PassportView /> },
      { path: "/paiements", element: <Payments /> },
      { path: "/confiance", element: <Trust /> },
      { path: "/proprietaire", element: <OwnerHome /> },
      { path: "/proprietaire/passeport", element: <MyVoicePassport /> },
      { path: "/proprietaire/demandes", element: <OwnerRequests /> },
      { path: "/proprietaire/profil", element: <OwnerProfile /> },
      { path: "/proprietaire/regles", element: <OwnerRules /> },
      { path: "/proprietaire/revenus", element: <OwnerEarnings /> },
      // Routes of the previous interface, kept so old links keep working.
      { path: "/studio/:id", element: <LegacyStudio /> },
      { path: "/studio", element: <Navigate to="/projets" replace /> },
      { path: "/voix", element: <Navigate to="/bibliotheque" replace /> },
      { path: "/passeport", element: <Navigate to="/passeports" replace /> },
      { path: "/journal", element: <Navigate to="/confiance?onglet=journal" replace /> },
      { path: "/jetons", element: <Navigate to="/paiements" replace /> },
      { path: "/ma-voix", element: <Navigate to="/proprietaire/regles" replace /> },
      { path: "/revenus", element: <Navigate to="/proprietaire/revenus" replace /> },
      { path: "*", element: <Home /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
