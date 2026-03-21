import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const normalizeDomain = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*/, "");

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: normalizeDomain(
    String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ""),
  ),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  ).trim(),
  messagingSenderId: String(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  ).trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Add relevant scopes
googleProvider.addScope("https://www.googleapis.com/auth/userinfo.email");
googleProvider.addScope("https://www.googleapis.com/auth/userinfo.profile");

// Set custom parameters to force account selection
googleProvider.setCustomParameters({
  prompt: "select_account",
});

export const loginWithGoogle = async () => {
  try {
    // Ensure persistence is set
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Firebase Auth Error:", error.code, error.message);
    if (error.code === "auth/popup-blocked") {
      alert("Please allow popups for this site to sign in with Google.");
      await signInWithRedirect(auth, googleProvider);
    } else if (String(error.message || "").includes("deleted_client")) {
      alert(
        "Google sign-in is blocked because the OAuth client was deleted (deleted_client). " +
          "In Firebase Console > Authentication > Sign-in method > Google, disable then re-enable Google provider to regenerate OAuth client.",
      );
    } else if (String(error.message || "").includes("invalid_client")) {
      alert(
        "Login failed due to Firebase Google provider configuration (invalid_client). " +
          "In Firebase Console, enable Google sign-in and verify OAuth settings for project medisim-nlp-project.",
      );
    } else {
      alert(`Login failed: ${error.message}`);
    }
    throw error;
  }
};

export const logout = () => signOut(auth);
