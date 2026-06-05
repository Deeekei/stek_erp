import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';

function Layout({ children, onLogout }) {
  const location = useLocation();

  // Состояния меню
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // --- НОВЫЕ СОСТОЯНИЯ УВЕДОМЛЕНИЙ ---
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Данные пользователя
  const [currentUser, setCurrentUser] = useState(null);

  // Состояния для формы пароля
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const profileMenuRef = useRef(null);
  const notificationsRef = useRef(null); // Реф для закрытия колокольчика по клику вне

  // 1. Загрузка профиля пользователя
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.user_id) {
            const res = await api.get(`users/${payload.user_id}/`);
            setCurrentUser(res.data);
          }
        }
      } catch (e) {
        console.error("Ошибка при получении профиля пользователя", e);
      }
    };
    fetchUser();
  }, []);

  // 2. Функции для работы с УВЕДОМЛЕНИЯМИ
  const fetchNotifications = async () => {
    try {
      const response = await api.get('notifications/');
      const data = response.data.results || response.data;
      setNotifications(data);
      // Считаем, сколько непрочитанных
      const unread = data.filter(n => !n.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Ошибка при загрузке уведомлений:", error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.post(`notifications/${id}/mark_as_read/`);
      // Локально обновляем статус, чтобы не делать лишний запрос
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Ошибка при отметке прочитанным:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('notifications/mark_all_as_read/');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Ошибка при отметке всех прочитанными:", error);
    }
  };

  // 3. Автоматическое обновление уведомлений (каждые 30 сек)
  useEffect(() => {
    // Грузим сразу при монтировании
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000); // 30000 мс = 30 секунд

    return () => clearInterval(interval);
  }, []);

  // 4. Закрытие менюшек при клике вне их зоны
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Логика мобильного меню
  useEffect(() => setIsSidebarOpen(false), [location]);
  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isSidebarOpen]);

  // Смена пароля
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return alert("Новые пароли не совпадают!");
    }
    try {
      await api.post('users/change_password/', {
        old_password: oldPassword,
        new_password: newPassword
      });
      alert("Пароль успешно изменен!");
      setIsPasswordModalOpen(false);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error) {
      alert("Ошибка при изменении пароля. Убедитесь, что старый пароль введен верно.");
    }
  };

  const checkIsActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const firstName = currentUser?.first_name || currentUser?.firstName || '';
  const lastName = currentUser?.last_name || currentUser?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || currentUser?.username || 'Администратор';
  const initials = firstName && lastName ? `${firstName[0]}${lastName[0]}`.toUpperCase() : (fullName[0] || 'A').toUpperCase();

  const baseClasses = "block px-4 py-3 rounded-lg transition-colors font-medium";
  const activeClasses = "bg-red-600 text-white shadow-md";
  const inactiveClasses = "text-slate-300 hover:bg-slate-800 hover:text-white";

  return (
    <div className="flex h-screen bg-gray-200 overflow-hidden">

      {/* Затемнение для мобилок */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* САЙДБАР */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 ease-in-out 
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:relative md:translate-x-0`}
      >
        <div className="p-6 flex justify-between items-center">
          <h1 className="text-2xl font-black text-red-500 tracking-wider">MINI ERP</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">✕</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-2 mt-2 pb-4">
          <Link to="/" className={`${baseClasses} ${checkIsActive('/') ? activeClasses : inactiveClasses}`}>Дашборд</Link>
          <Link to="/projects" className={`${baseClasses} ${checkIsActive('/projects') ? activeClasses : inactiveClasses}`}>Проекты</Link>
          <Link to="/my-tasks" className={`${baseClasses} ${checkIsActive('/my-tasks') ? activeClasses : inactiveClasses}`}>Мои задачи</Link>
        </nav>

        <div className="p-4 border-t border-slate-700 shrink-0">
          <button onClick={onLogout} className="w-full px-4 py-2 text-left text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors font-medium">
            🚪 Выйти
          </button>
        </div>
      </aside>

      {/* ОСНОВНАЯ ЧАСТЬ */}
      <main className="flex-1 flex flex-col w-full h-full overflow-hidden relative">

        {/* ШАПКА */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 shadow-sm z-10 shrink-0">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden mr-3 p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-lg md:text-xl font-semibold text-gray-800 truncate">Обзор системы</h2>
          </div>

          <div className="flex items-center space-x-3 md:space-x-5 shrink-0">

            {/* --- КОЛОКОЛЬЧИК УВЕДОМЛЕНИЙ --- */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
              >
                {/* SVG иконка колокольчика */}
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>

                {/* Красный кружок (badge), если есть непрочитанные */}
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 border-2 border-white rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Выпадающее окно уведомлений */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 origin-top-right overflow-hidden flex flex-col max-h-[500px]">
                  <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <h3 className="font-bold text-gray-800">Уведомления</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Прочитать все
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {notifications.length > 0 ? (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => !notif.is_read && markAsRead(notif.id)}
                          className={`p-3 rounded-xl transition-all cursor-pointer ${notif.is_read ? 'bg-transparent hover:bg-gray-50' : 'bg-blue-50/50 hover:bg-blue-50 border border-blue-100'}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <h4 className={`text-sm ${notif.is_read ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>
                              {notif.title}
                            </h4>
                            {!notif.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0 ml-2"></span>}
                          </div>
                          <p className={`text-xs ${notif.is_read ? 'text-gray-500' : 'text-gray-700 font-medium'} leading-relaxed`}>
                            {notif.message}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-2 font-medium">
                            {new Date(notif.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                        <span className="text-4xl mb-3">📭</span>
                        <p className="text-sm">Нет новых уведомлений</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* --- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ --- */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center space-x-3 md:space-x-4 shrink-0 hover:bg-gray-50 p-1.5 md:pr-4 rounded-full md:rounded-lg transition-colors focus:outline-none border border-transparent hover:border-gray-200"
              >
                <div className="w-9 h-9 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                  {initials}
                </div>
                <span className="text-sm font-bold text-gray-700 hidden sm:block truncate max-w-[150px]">
                  {fullName}
                </span>
                <svg className={`w-4 h-4 text-gray-400 hidden sm:block transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 origin-top-right transition-all">
                  <div className="px-4 py-3 border-b border-gray-100 mb-1 sm:hidden">
                    <p className="text-sm font-bold text-gray-800 truncate">{fullName}</p>
                  </div>
                  <button
                    onClick={() => { setIsProfileMenuOpen(false); setIsPasswordModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors flex items-center"
                  >
                    <span className="mr-3 text-lg">🔒</span> Изменить пароль
                  </button>
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center"
                  >
                    <span className="mr-3 text-lg">🚪</span> Выйти из системы
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* КОНТЕНТ */}
        <div className="flex-1 overflow-auto p-4 md:p-8 relative bg-gray-200">
          {children}
        </div>

      </main>

      {/* --- МОДАЛЬНОЕ ОКНО ИЗМЕНЕНИЯ ПАРОЛЯ --- */}
      {isPasswordModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsPasswordModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-md relative overflow-hidden">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Изменение пароля</h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Старый пароль</label>
                <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors" required minLength="8" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Подтвердите новый пароль</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors" required minLength="8" />
              </div>
              <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-gray-100">
                <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-md transition-colors">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;