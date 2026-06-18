import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';
import api from '../api';

function Projects() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  // ОПТИМИЗАЦИЯ: Отдельный стейт загрузки только для проектов
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // Состояния модалки создания проекта
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [planStartDate, setPlanStartDate] = useState('');
  const [planEndDate, setPlanEndDate] = useState('');
  const [manager, setManager] = useState(null);
  const [visibility, setVisibility] = useState('all');
  const [allowedUsers, setAllowedUsers] = useState([]);

  // Состояния модалки редактирования проекта
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editPlanStartDate, setEditPlanStartDate] = useState('');
  const [editPlanEndDate, setEditPlanEndDate] = useState('');
  const [editManager, setEditManager] = useState(null);
  const [editVisibility, setEditVisibility] = useState('all');
  const [editAllowedUsers, setEditAllowedUsers] = useState([]);

  useEffect(() => {
    // ОПТИМИЗАЦИЯ: Читаем токен сразу синхронно, чтобы права заработали до загрузки сети
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser({ id: payload.user_id, role: payload.role });
      } catch (e) {
        console.error("Ошибка чтения токена:", e);
      }
    }

    // Запускаем запросы параллельно, но проекты не ждут юзеров
    fetchProjects();
    fetchUsersBackground();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      const res = await api.get('projects/');
      // Поддержка пагинации (на случай, если список проектов станет огромным)
      setProjects(res.data.results || res.data);
    } catch (error) {
      console.error("Ошибка загрузки проектов:", error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchUsersBackground = async () => {
    try {
      // Грузим юзеров в фоне, чтобы они были готовы к открытию модалки
      const res = await api.get('users/');
      const fetchedUsers = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Ошибка фоновой загрузки пользователей:", error);
    }
  };

  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
  }));

  const canEditProject = (project) => {
    if (!currentUser) return false;
    const managerId = project.manager?.id ?? project.manager;
    return currentUser.role === 'admin' || currentUser.role === 'director' || currentUser.id == managerId;
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const payload = {
      title: newProjectTitle,
      description: newProjectDescription,
      plan_start_date: planStartDate || null,
      plan_end_date: planEndDate || null,
      manager: manager,
      visibility: visibility,
      allowed_users: visibility === 'selected' ? allowedUsers : []
    };

    try {
      const response = await api.post('projects/', payload);
      setProjects([response.data, ...projects]);
      setIsModalOpen(false);
      setNewProjectTitle('');
      setNewProjectDescription('');
      setPlanStartDate('');
      setPlanEndDate('');
      setManager(null);
      setVisibility('all');
      setAllowedUsers([]);
    } catch (error) {
      alert(`Ошибка: ${JSON.stringify(error.response?.data)}`);
    }
  };

  const handleOpenEdit = (project) => {
    setEditProjectId(project.id);
    setEditProjectTitle(project.title || '');
    setEditProjectDescription(project.description || '');
    setEditPlanStartDate(project.plan_start_date || '');
    setEditPlanEndDate(project.plan_end_date || '');
    setEditManager(project.manager?.id ?? project.manager ?? null);
    setEditVisibility(project.visibility || 'all');
    setEditAllowedUsers(project.allowed_users || []);
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    const payload = {
      title: editProjectTitle,
      description: editProjectDescription,
      plan_start_date: editPlanStartDate || null,
      plan_end_date: editPlanEndDate || null,
      manager: editManager,
      visibility: editVisibility,
      allowed_users: editVisibility === 'selected' ? editAllowedUsers : []
    };

    try {
      const response = await api.patch(`projects/${editProjectId}/`, payload);
      setProjects(projects.map(p => p.id === editProjectId ? response.data : p));
      setIsEditModalOpen(false);
    } catch (error) {
      alert(`Ошибка: ${JSON.stringify(error.response?.data)}`);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm("Удалить проект навсегда? Это действие необратимо.")) return;

    // Оптимистичное удаление (мгновенно убираем с экрана)
    setProjects(prev => prev.filter(p => p.id !== id));

    try {
      await api.delete(`projects/${id}/`);
    } catch (error) {
      alert("Ошибка при удалении.");
      fetchProjects(); // Откатываем назад при ошибке
    }
  };

  // === ОБРАБОТЧИК ЗАКРЕПЛЕНИЯ ПРОЕКТА ===
  const handleTogglePin = async (projectId) => {
    try {
      const response = await api.post(`projects/${projectId}/toggle_pin/`);
      // Обновляем статус is_pinned у конкретного проекта
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, is_pinned: response.data.is_pinned } : p));
    } catch (error) {
      alert("Не удалось изменить статус закрепления проекта");
    }
  };

  const getVisibilityLabel = (vis) => {
    switch(vis) {
      case 'all': return '🌍 Все';
      case 'department': return '🏢 Отдел';
      case 'selected': return '👥 Группа';
      case 'only_me': return '🔒 Приватно';
      default: return '🌍 Все';
    }
  };

  // === СОРТИРОВКА ПРОЕКТОВ (ЗАКРЕПЛЕННЫЕ НАВЕРХ) ===
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (a.is_pinned === b.is_pinned) return 0;
      return a.is_pinned ? -1 : 1;
    });
  }, [projects]);

  if (loadingProjects) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-gray-500">
        <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="font-medium text-lg">Загрузка проектов...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Проекты</h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md transition-colors">
          + Создать проект
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 p-12">
          <span className="text-6xl mb-4">📭</span>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Проектов пока нет</h3>
          <p className="text-gray-500 mb-6 text-center max-w-md">Здесь будут отображаться все ваши рабочие проекты. Нажмите кнопку выше, чтобы создать первый!</p>
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-50 text-blue-600 px-6 py-2 rounded-lg font-bold hover:bg-blue-100 transition-colors">
            Создать проект
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedProjects.map(project => (
            <div key={project.id} className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col hover:shadow-md transition-all ${project.is_pinned ? 'border-blue-300 shadow-blue-100/50' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start mb-4">

                {/* Кнопка булавки и Название проекта */}
                <div className="flex items-start gap-2 overflow-hidden">
                  <button
                    onClick={(e) => { e.preventDefault(); handleTogglePin(project.id); }}
                    className="text-xl mt-0.5 rounded-lg hover:bg-gray-100 transition-all active:scale-95 shrink-0"
                    title={project.is_pinned ? "Открепить проект" : "Закрепить проект"}
                  >
                    <span className={project.is_pinned ? "opacity-100 drop-shadow-md" : "opacity-25 hover:opacity-60 transition-opacity"}>
                      📌
                    </span>
                  </button>
                  <h3 className="text-xl font-bold text-gray-800 line-clamp-2" title={project.title}>{project.title}</h3>
                </div>

                {canEditProject(project) && (
                  <div className="flex space-x-3 ml-4 shrink-0">
                    <button onClick={() => handleOpenEdit(project)} className="text-blue-400 hover:text-blue-600 transition-colors text-lg" title="Редактировать">✏️</button>
                    <button onClick={() => handleDeleteProject(project.id)} className="text-red-400 hover:text-red-600 transition-colors text-lg" title="Удалить">🗑️</button>
                  </div>
                )}
              </div>

              <p className="text-gray-600 text-sm mb-6 flex-1 line-clamp-3" title={project.description}>{project.description || 'Без описания'}</p>

              <div className="flex items-center text-xs text-gray-400 mb-4 space-x-4">
                {project.plan_end_date && <span>📅 До: {project.plan_end_date}</span>}
                {project.manager_name && <span className="truncate">👤 {project.manager_name}</span>}
              </div>

              <div className="flex justify-between items-center border-t border-gray-50 pt-4 mt-auto">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-gray-100 text-gray-500 rounded">{getVisibilityLabel(project.visibility)}</span>
                <Link to={`/projects/${project.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-bold">Открыть →</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ ПРОЕКТА */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Новый проект</h3>
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                    <input type="text" value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
                    <Select
                      options={userOptions}
                      placeholder="Поиск по ФИО..."
                      isSearchable={true}
                      onChange={(opt) => setManager(opt ? opt.value : null)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                    <textarea value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg min-h-[80px] outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Начало</label>
                      <input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн</label>
                      <input type="date" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-sm font-bold text-blue-800 mb-2">Видимость</label>
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full px-4 py-2 border border-blue-200 rounded-lg bg-white mb-4 outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">🌍 Все</option>
                      <option value="department">🏢 Отдел</option>
                      <option value="selected">👥 Выбранные</option>
                      <option value="only_me">🔒 Приватно</option>
                    </select>
                    {visibility === 'selected' && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-blue-800 mb-1">Выберите людей</label>
                        <Select
                          isMulti
                          options={userOptions}
                          placeholder="Поиск и выбор..."
                          onChange={(opts) => setAllowedUsers(opts.map(o => o.value))}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold shadow-md transition-colors">Создать проект</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА РЕДАКТИРОВАНИЯ ПРОЕКТА */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Редактировать проект</h3>
            <form onSubmit={handleUpdateProject} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                    <input type="text" value={editProjectTitle} onChange={(e) => setEditProjectTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
                    <Select
                      options={userOptions}
                      value={userOptions.find(o => o.value == editManager) || null}
                      placeholder="Поиск по ФИО..."
                      isSearchable={true}
                      onChange={(opt) => setEditManager(opt ? opt.value : null)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                    <textarea value={editProjectDescription} onChange={(e) => setEditProjectDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg min-h-[80px] outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Начало</label>
                      <input type="date" value={editPlanStartDate} onChange={(e) => setEditPlanStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн</label>
                      <input type="date" value={editPlanEndDate} onChange={(e) => setEditPlanEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-sm font-bold text-blue-800 mb-2">Видимость</label>
                    <select value={editVisibility} onChange={(e) => setEditVisibility(e.target.value)} className="w-full px-4 py-2 border border-blue-200 rounded-lg bg-white mb-4 outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">🌍 Все</option>
                      <option value="department">🏢 Отдел</option>
                      <option value="selected">👥 Выбранные</option>
                      <option value="only_me">🔒 Приватно</option>
                    </select>
                    {editVisibility === 'selected' && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-blue-800 mb-1">Выберите людей</label>
                        <Select
                          isMulti
                          options={userOptions}
                          value={userOptions.filter(opt => editAllowedUsers.includes(opt.value))}
                          placeholder="Поиск и выбор..."
                          onChange={(opts) => setEditAllowedUsers(opts.map(o => o.value))}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100 mt-8">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold shadow-md transition-colors">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Projects;