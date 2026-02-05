import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCawwQE4-R10is2rxpAL9naATxflML1eqY",
  authDomain: "alliche-fetcher.firebaseapp.com",
  databaseURL: "https://alliche-fetcher-default-rtdb.firebaseio.com",
  projectId: "alliche-fetcher",
  storageBucket: "alliche-fetcher.firebasestorage.app",
  messagingSenderId: "676605172780",
  appId: "1:676605172780:web:a37e4425c91920c5b98589",
  measurementId: "G-VR7HGGTD8P"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// Set persistence to local storage
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

// Initialize Analytics only in browser
let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
