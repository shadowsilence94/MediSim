import { useState } from "react";
import { LogIn, LogOut, Sun, Moon, Menu, X, BarChart2 } from "lucide-react";
import { loginWithGoogle, logout } from "../lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import EvaluationModal from "./EvaluationModal";

interface NavbarProps {
  user: any;
  isAdmin: boolean;
  userRole: string;
  theme: string;
  toggleTheme: () => void;
  setCurrentPage: (page: any) => void;
  currentPage: string;
}

export default function Navbar({
  user,
  isAdmin,
  userRole,
  theme,
  toggleTheme,
  setCurrentPage,
  currentPage,
}: NavbarProps) {
  const menuItems = [
    { key: "diagnostic", label: "Diagnostic" },
    { key: "triage", label: "Triage" },
    { key: "history", label: "History" },
    { key: "settings", label: "Settings" }
  ];

  if (isAdmin || userRole === "physician") {
    menuItems.push({ key: "admin", label: "Care Ops" });
  }
  if (isAdmin) {
    menuItems.push({ key: "app-management", label: "App Management" });
  }

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [evalModalOpen, setEvalModalOpen] = useState(false);

  return (
    <nav className="sticky top-4 z-50 flex items-center justify-between mx-auto w-[calc(100%-2rem)] max-w-6xl px-6 py-4 apple-glass-panel rounded-2xl transition-all duration-500">
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setCurrentPage("home")}
      >
        <div className="flex flex-col">
          <span className="text-xl font-semibold tracking-tight text-sage-900 dark:text-sage-50 leading-none">
            MediSim
          </span>
          <span className="text-[10px] font-medium tracking-wide text-sage-600 uppercase opacity-70">
            Clinical Intelligence Platform
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="hidden lg:flex gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
            {menuItems.map((item) => (
              <NavItem
                key={item.key}
                label={item.label}
                active={currentPage === item.key}
                onClick={() => setCurrentPage(item.key)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 pl-6 border-l border-black/10 dark:border-white/10">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all text-sage-600 dark:text-sage-400 hover:text-sage-500"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          
          {user && (
            <button
              onClick={() => setEvalModalOpen(true)}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
              title="Phase 4 Evaluation"
            >
              <BarChart2 size={16} />
              Evaluate
            </button>
          )}

          {user ? (
            <div className="hidden lg:flex items-center gap-4">
              <div className="text-right hidden sm:block leading-tight">
                <p className="text-[12px] font-semibold text-sage-900 dark:text-sage-50">
                  {user.displayName}
                </p>
                <p className="text-[10px] text-sage-600 font-medium uppercase opacity-70">
                  Signed In
                </p>
              </div>
              <img
                src={user.photoURL || ""}
                className="w-9 h-9 rounded-lg border border-sage-500/20 p-0.5 shadow-sm"
                alt="avatar"
              />
              <button
                onClick={logout}
                className="p-1.5 text-sage-500 hover:text-sage-700 transition-colors"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="hidden lg:inline-flex group items-center gap-2 px-5 py-2 bg-sage-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-sage-500/20 hover:bg-sage-600 hover:-translate-y-0.5 transition-all"
            >
              <LogIn
                size={14}
                className="group-hover:translate-x-0.5 transition-transform"
              />
              <span>Sign In</span>
            </button>
          )}

          {/* Desktop Login block is done above. Below is mobile hamburger toggler */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-sage-600 dark:text-sage-400"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-24 left-0 right-0 bg-white/95 dark:bg-black/95 backdrop-blur-3xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-6 lg:hidden flex flex-col gap-4 overflow-hidden z-[100]"
          >
            <div className="flex flex-col gap-2">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setCurrentPage(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center justify-start gap-4 p-4 rounded-xl font-bold uppercase tracking-widest text-[11px] transition-all ${
                    currentPage === item.key
                      ? "bg-sage-500 text-white shadow-md shadow-sage-500/20"
                      : "bg-black/5 dark:bg-white/5 text-sage-700 dark:text-sage-300 hover:bg-black/10 dark:hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            
            {!user ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  loginWithGoogle();
                }}
                className="group w-full flex items-center justify-center gap-2 p-4 mt-2 bg-sage-500 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-sage-500/20 hover:bg-sage-600 transition-all"
              >
                <LogIn size={16} className="group-hover:translate-x-1 transition-transform" />
                <span>Secure Sign In</span>
              </button>
            ) : (
              <div className="mt-2 pt-4 border-t border-black/5 dark:border-white/5 flex flex-col gap-4">
                <div className="flex items-center gap-3 px-2">
                  <img
                    src={user.photoURL || ""}
                    className="w-10 h-10 rounded-xl border border-sage-500/20 p-0.5 shadow-sm"
                    alt="avatar"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-sage-900 dark:text-sage-50">
                      {user.displayName}
                    </span>
                    <span className="text-[10px] text-sage-500 uppercase tracking-widest font-semibold">
                      Signed In
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 text-red-600 text-[11px] font-black uppercase tracking-wider rounded-xl hover:bg-red-500 hover:text-white transition-all"
                >
                  <LogOut size={16} />
                  <span>Secure Sign Out</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Evaluation Interface Component */}
      <EvaluationModal 
        isOpen={evalModalOpen} 
        onClose={() => setEvalModalOpen(false)} 
        user={user} 
      />
    </nav>
  );
}

function NavItem({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 font-semibold text-[11px] ${
        active
          ? "bg-sage-500 text-white shadow-md shadow-sage-500/10"
          : "text-sage-600 dark:text-sage-400 hover:text-sage-500"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}
