import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// ВСТАВЬ СЮДА СВОИ ДАННЫЕ ИЗ FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyCWyt7XUS9w8xC5vsitvdHymKwcXprGI4o",
  authDomain: "stekerp-b5362.firebaseapp.com",
  projectId: "stekerp-b5362",
  storageBucket: "stekerp-b5362.firebasestorage.app",
  messagingSenderId: "176661325401",
  appId: "1:176661325401:web:0e5dc9d8615835abf2b348"
};


const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

// Функция для запроса прав и получения токена
export const requestForToken = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // ВНИМАНИЕ: Сюда нужно вставить твой VAPID Key из Firebase (Project Settings -> Cloud Messaging -> Web Configuration)
      const currentToken = await getToken(messaging, {
          vapidKey: 'BB8JrDjI_LWtjV6T1k_bmeXrho1-y4rWW5ebnPDDldnli7X0PQEE9BL-y8eT6cozim1m50SqAOJYMq_clKZTzlM'
      });
      if (currentToken) {
        return currentToken;
      }
    }
    console.log("Пользователь запретил уведомления.");
    return null;
  } catch (err) {
    console.error("Ошибка при получении токена Firebase", err);
    return null;
  }
};

// Функция-слушатель для пушей, когда вкладка с ERP открыта
export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });