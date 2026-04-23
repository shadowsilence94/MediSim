import { useState, useEffect } from "react";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet } from "./lib/api";

// --- Modular Components ---
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";
import Footer from "./components/Footer";
import OnboardingTour from "./components/OnboardingTour";

// --- Views ---
import DiagnosticView from "./views/DiagnosticView";
import TriageView from "./views/TriageView";
import HistoryView from "./views/HistoryView";
import SettingsView from "./views/SettingsView";
import AdminView from "./views/AdminView";
import AppManagementView from "./views/AppManagementView";
import GlobalChat from "./components/GlobalChat";

// --- Types ---
type Theme = "light" | "dark";
type Page = "home" | "diagnostic" | "triage" | "history" | "settings" | "admin" | "app-management";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState("patient");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const data = await apiGet<any>("/me");
          setIsAdmin(data.profile.is_admin);
          setUserRole(data.profile.role || "patient");
          if (!data.profile.has_personal_api_key && !data.profile.can_use_general_api) {
            setCurrentPage("settings");
          }
        } catch (e) {
          console.error("Failed to fetch user profile", e);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-accent-primary"></div>
          <div className="absolute inset-0 animate-pulse-sage rounded-full bg-accent-primary/10 blur-2xl"></div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-700">
      <Navbar
        user={user}
        isAdmin={isAdmin}
        userRole={userRole}
        theme={theme}
        toggleTheme={toggleTheme}
        setCurrentPage={setCurrentPage}
        currentPage={currentPage}
      />

      <main className="flex-grow">
        <AnimatePresence mode="wait">
          {!user ? (
            <LandingPage key="landing" />
          ) : (
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="py-12"
            >
              <PageContent
                page={currentPage}
                user={user}
                setCurrentPage={setCurrentPage}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
      {user && <OnboardingTour />}
      {user && <GlobalChat userRole={userRole as "patient" | "physician" | "admin"} />}
    </div>
  );
}

function PageContent({ page, setCurrentPage }: any) {
  switch (page) {
    case "app-management":
      return <AppManagementView />;
    case "home":
      return <Dashboard setCurrentPage={setCurrentPage} />;
    case "diagnostic":
      return <DiagnosticView />;
    case "triage":
      return <TriageView />;
    case "history":
      return <HistoryView />;
    case "settings":
      return <SettingsView />;
    case "admin":
      return <AdminView />;
    default:
      return <Dashboard setCurrentPage={setCurrentPage} />;
  }
}
