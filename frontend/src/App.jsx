import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { requestForToken, onMessageListener } from './firebase';
import api from './api';
import Employees from './components/Employees';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard.jsx';
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import MyTasks from './components/MyTasks';
import TaskStandalone from './components/TaskStandalone';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [toast, setToast] = useState({ show: false, title: '', body: '', link: '' });

  useEffect(() => {
    if (!token) return;

    const setupWebPush = async () => {
      try {
        const fcmToken = await requestForToken();
        if (fcmToken) {
          await api.post('notifications/save_fcm_token/', { token: fcmToken });
          console.log("FCM токен успешно привязан к пользователю в БД!");
        }
      } catch (error) {
        console.error("Не удалось сохранить FCM токен на сервере:", error);
      }
    };

    setupWebPush();

    // ИСПРАВЛЕНИЕ: Теперь используем колбэк и сохраняем функцию отписки
    const unsubscribe = onMessageListener((payload) => {
      console.log('Получен пуш на фронтенде:', payload);
      setToast({
        show: true,
        title: payload.notification?.title || 'Новое уведомление',
        body: payload.notification?.body || '',
        link: payload.data?.link || '' // Извлекаем скрытую ссылку
      });

      setTimeout(() => {
        setToast({ show: false, title: '', body: '', link: '' });
      }, 5000);
    });

    // Очищаем слушатель, если компонент размонтируется
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };

  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setToken(null);
  };

  if (!token) {
    return <Login onLoginSuccess={setToken} />;
  }

  return (
    <BrowserRouter>
      {/* КЛИКАБЕЛЬНЫЙ ТОСТ */}
      {toast.show && (
        <div
          className="fixed top-4 right-4 z-[9999] bg-white border-l-4 border-blue-600 rounded-xl shadow-2xl p-4 max-w-sm animate-bounce cursor-pointer"
          onClick={() => {
            setToast({ show: false, title: '', body: '', link: '' });
            if (toast.link) {
              // Переход по скрытой ссылке
              window.location.href = toast.link;
            }
          }}
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1">
                🔔 {toast.title}
              </h4>
              <p className="text-gray-600 text-xs mt-1 leading-relaxed break-words">{toast.body}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast({ show: false, title: '', body: '', link: '' }); }}
              className="text-gray-400 hover:text-gray-600 font-bold ml-4 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <Layout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/employees" element={<Employees />} />
          {/* Скрытый маршрут для отдельной задачи */}
          <Route path="/task/:id" element={<TaskStandalone />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;