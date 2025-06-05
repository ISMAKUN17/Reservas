// firebase-config.js

// Importa las funciones necesarias de los SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getDatabase, ref, push, set, get, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-database.js";
// No importamos serverTimestamp para Realtime Database directamente aquí, lo manejaremos con new Date().getTime() o un paquete si es necesario.

// Tu configuración de Firebase (asegúrate de que sea la correcta)
const firebaseConfig = {
  apiKey: "AIzaSyDUirwoSQgvcMZn7uLjKMAxlTA15Jkl2BM",
  authDomain: "ismakun-bf0fa.firebaseapp.com",
  databaseURL: "https://ismakun-bf0fa-default-rtdb.firebaseio.com", // ¡Muy importante que esté aquí!
  projectId: "ismakun-bf0fa",
  storageBucket: "ismakun-bf0fa.firebasestorage.app",
  messagingSenderId: "1028877703945",
  appId: "1:1028877703945:web:331de48acbcdf2234a51d8"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

// Obtén una referencia a Realtime Database
const db = getDatabase(app);

// Exporta las funciones y la instancia 'db' para que puedan ser utilizadas en otros archivos JS
export { db, ref, push, set, get, onValue, update, remove };
