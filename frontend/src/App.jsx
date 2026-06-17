import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { requestForToken, onMessageListener } from './firebase'; // <-- Импорт логики Firebase
import api from './api'; // <-- Твой настроенный axios

import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard.jsx';
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import MyTasks from './components/MyTasks';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  // Стейт для красивого всплывающего уведомления (когда вкладка открыта)
  const [toast, setToast] = useState({ show: false, title: '', body: '' });

  useEffect(() => {
    // Если пользователь не авторизован — пуши не запрашиваем
    if (!token) return;

    const setupWebPush = async () => {
      try {
        const fcmToken = await requestForToken();
        if (fcmToken) {
          // Отправляем токен девайса на наш бэкенд Django
          await api.post('notifications/save_fcm_token/', { token: fcmToken });
          console.log("FCM токен успешно привязан к пользователю в БД!");
        }
      } catch (error) {
        console.error("Не удалось сохранить FCM токен на сервере:", error);
      }
    };

    setupWebPush();

    // Слушаем пуши в реальном времени, ПОКА ВКЛАДКА ОТКРЫТА
    onMessageListener()
      .then((payload) => {
        // Показываем красивую плашку
        setToast({
          show: true,
          title: payload.notification?.title || 'Новое уведомление',
          body: payload.notification?.body || ''
        });

        // Автоматически скрываем её через 5 секунд
        setTimeout(() => {
          setToast({ show: false, title: '', body: '' });
        }, 5000);
      })
      .catch((err) => console.log('Ошибка при получении пуша на фронтенде: ', err));

  }, [token]); // Хук сработает заново, если изменится токен (например, при логине)

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return <Login onLoginSuccess={setToken} />;
  }

  return (
    <BrowserRouter>
      {/* === КРАСИВЫЙ ВСПЛЫВАЮЩИЙ ТОСТ (ДЛЯ ОНЛАЙН ПУШЕЙ) === */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-[9999] bg-white border-l-4 border-blue-600 rounded-xl shadow-2xl p-4 max-w-sm animate-bounce cursor-pointer" onClick={() => setToast({ show: false, title: '', body: '' })}>
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1">
                🔔 {toast.title}
              </h4>
              <p className="text-gray-600 text-xs mt-1 leading-relaxed break-words">{toast.body}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast({ show: false, title: '', body: '' }); }}
              className="text-gray-400 hover:text-gray-600 font-bold ml-4 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <Layout onLogout={handleLogout}>
        <Routes>
          {/* Главная страница теперь указывает на наш новый Dashboard */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;