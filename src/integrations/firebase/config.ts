import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCawwQE4-R10is2rxpAL9naATxflML1eqY",
  authDomain: "alliche-fetcher.firebaseapp.com",
  projectId: "alliche-fetcher",
  storageBucket: "alliche-fetcher.firebasestorage.app",
  messagingSenderId: "676605172780",
  appId: "1:676605172780:web:a37e4425c91920c5b98589",
  measurementId: "G-VR7HGGTD8P",
  databaseURL: "https://alliche-fetcher-default-rtdb.firebaseio.com"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// Initialize Analytics only in browser
let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
