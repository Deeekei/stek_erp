import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';
import api from '../api';

function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Стейты для селектов отчетов
  const [reportUserId, setReportUserId] = useState(null);
  const [reportProjectId, setReportProjectId] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Достаем информацию о текущем пользователе из токена
      const token = localStorage.getItem('token');
      let currentUserId = null;
      let currentUserRole = 'employee';

      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          currentUserId = payload.user_id;
          currentUserRole = payload.role || 'employee';
        } catch (e) {
          console.error("Auth error:", e);
        }
      }

      // 2. Параллельно загружаем пользователей и проекты для селектов
      const [usersRes, projectsRes] = await Promise.all([
        api.get('users/').catch(() => ({ data: [] })),
        api.get('projects/').catch(() => ({ data: [] }))
      ]);

      const usersArray = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.results || []);
      const projectsArray = Array.isArray(projectsRes.data) ? projectsRes.data : (projectsRes.data?.results || []);

      setUsers(usersArray);
      setProjects(projectsArray);

      // Сохраняем текущего юзера
      const foundUser = usersArray.find(u => u.id === currentUserId);
      if (foundUser) {
        setCurrentUser({ ...foundUser, role: currentUserRole });
      } else {
        setCurrentUser({ id: currentUserId, role: currentUserRole, first_name: 'Пользователь' });
      }

    } catch (error) {
      console.error("Ошибка загрузки данных дашборда:", error);
    } finally {
      setLoading(false);
    }
  };

  // Проверяем, есть ли права (Директор, Админ или Руководитель)
  const isBoss = currentUser && ['admin', 'director', 'manager'].includes(currentUser.role);

  // === ФУНКЦИИ ВЫГРУЗКИ EXCEL ===

  const handleDownloadEmployeeReport = async () => {
    if (!reportUserId) return alert("Пожалуйста, выберите сотрудника!");

    try {
      // Бэкенд теперь сразу отдает файл по этому адресу
      const response = await api.get(`reports/employee/${reportUserId}/`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Отчет_Сотрудник_${reportUserId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Ошибка при выгрузке отчета по сотруднику. Убедитесь, что сотрудник существует.");
    }
  };

  const handleDownloadProjectReport = async () => {
    if (!reportProjectId) return alert("Пожалуйста, выберите проект!");

    try {
      // Бэкенд теперь сразу отдает файл по этому адресу
      const response = await api.get(`reports/project/${reportProjectId}/`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Отчет_Проект_${reportProjectId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Ошибка при выгрузке отчета по проекту. Убедитесь, что проект существует.");
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500 font-medium">Загрузка дашборда...</div>;
  }

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">
          Добро пожаловать, {currentUser?.first_name || 'Коллега'}! 👋
        </h1>
        <p className="text-gray-500 mt-2">
          {isBoss ? 'Панель управления и аналитики' : 'Сводка по вашим текущим задачам'}
        </p>
      </div>

      {/* ПАНЕЛЬ ОТЧЕТОВ ТОЛЬКО ДЛЯ РУКОВОДСТВА */}
      {isBoss && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            📊 Аналитика и выгрузки
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Блок: Отчет по сотруднику */}
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 shadow-inner">
              <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
                Успеваемость сотрудника
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Select
                    options={users.map(u => ({ value: u.id, label: u.first_name ? `${u.first_name} ${u.last_name}`.trim() : u.username }))}
                    onChange={(opt) => setReportUserId(opt ? opt.value : null)}
                    placeholder="Выберите сотрудника..."
                    isClearable
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    menuPortalTarget={document.body}
                  />
                </div>
                <button
                  onClick={handleDownloadEmployeeReport}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                >
                  📥 В Excel
                </button>
              </div>
            </div>

            {/* Блок: Отчет по проекту */}
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 shadow-inner">
              <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
                Сводка по проекту
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Select
                    options={projects.map(p => ({ value: p.id, label: p.title }))}
                    onChange={(opt) => setReportProjectId(opt ? opt.value : null)}
                    placeholder="Выберите проект..."
                    isClearable
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    menuPortalTarget={document.body}
                  />
                </div>
                <button
                  onClick={handleDownloadProjectReport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                >
                  📥 В Excel
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Быстрые ссылки или виджеты */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/tasks" className="block bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">📋</div>
          <h3 className="text-xl font-bold text-gray-800 mb-1">Мои задачи</h3>
          <p className="text-gray-500 text-sm">Перейти к списку задач, назначенных на вас</p>
        </Link>

        <Link to="/projects" className="block bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">📁</div>
          <h3 className="text-xl font-bold text-gray-800 mb-1">Все проекты</h3>
          <p className="text-gray-500 text-sm">Просмотр активных проектов и диаграмм Ганта</p>
        </Link>
      </div>

    </div>
  );
}

export default Dashboard;