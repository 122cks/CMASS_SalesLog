// Firebase Configuration and Initialization
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration for cmass-sales project
const firebaseConfig = {
  apiKey: "AIzaSyARdXNfFCUShNeFXV8cTDzFbKa4GId5EvU",
  authDomain: "cmass-sales.firebaseapp.com",
  projectId: "cmass-sales",
  storageBucket: "cmass-sales.firebasestorage.app",
  messagingSenderId: "918981476485",
  appId: "1:918981476485:web:7939150e23500e2703a9ec",
  measurementId: "G-9188JJXRWX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export for use in other scripts
window.firebaseApp = app;
window.firestoreDb = db;
window.firestoreCollection = collection;
window.firestoreAddDoc = addDoc;
window.firestoreServerTimestamp = serverTimestamp;

console.log('[Firebase] Initialized successfully');
