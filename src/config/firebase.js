import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCPic0scZWwesAR12F3UZjN8HUV0Cj-UTQ",
  authDomain: "catsplit-app.firebaseapp.com",
  projectId: "catsplit-app",
  storageBucket: "catsplit-app.firebasestorage.app",
  messagingSenderId: "210729139240",
  appId: "1:210729139240:web:341ebc7942d40ec7c3891d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);