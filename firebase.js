// Conexión con Firebase (mismo proyecto que mis otras apps)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

// Único usuario autorizado: cualquier otra cuenta de Google es rechazada
export const OWNER_EMAIL = 'arandabarbarafa@gmail.com';

const firebaseConfig = {
  apiKey: 'AIzaSyC1mBofZooE010PRKjCo-fENDYU1lqWbh0',
  authDomain: 'deberes-e3282.firebaseapp.com',
  projectId: 'deberes-e3282',
  storageBucket: 'deberes-e3282.firebasestorage.app',
  messagingSenderId: '457365914046',
  appId: '1:457365914046:web:e3cf994128c4b75da479ef'
};
// Esta config NO es un secreto: es la dirección pública del proyecto.
// La seguridad la ponen las reglas de Firestore + el filtro de usuario.

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Login con Google: popup y, si el navegador lo bloquea, redirección (móvil)
export async function entrar() {
  const proveedor = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, proveedor);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, proveedor);
    } else {
      throw e;
    }
  }
}

export function salir() { return signOut(auth); }

// Recoger el resultado del login por redirección (móvil)
getRedirectResult(auth).catch(() => {});

export { onAuthStateChanged };
