// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// СЮДА ТОЖЕ ВСТАВЬ СВОЙ КОНФИГ ИЗ FIREBASE
firebase.initializeApp({
  apiKey: "ТВОЙ_API_KEY",
  authDomain: "твой-проект.firebaseapp.com",
  projectId: "твой-проект",
  storageBucket: "твой-проект.appspot.com",
  messagingSenderId: "ТВОЙ_SENDER_ID",
  appId: "ТВОЙ_APP_ID"
});

const messaging = firebase.messaging();

// Логика получения пуша в фоновом режиме
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Получено фоновое сообщение ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png' // Убедись, что иконка есть в папке public
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});