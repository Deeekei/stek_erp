import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select'; // Импортируем библиотеку
import api from '../api';

function Projects() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Состояния модалки создания проекта
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Состояния планирования
  const [planStartDate, setPlanStartDate] = useState('');
  const [planEndDate, setPlanEndDate] = useState('');
  const [manager, setManager] = useState(null);

  // Состояния видимости
  const [visibility, setVisibility] = useState('all');
  const [allowedUsers, setAllowedUsers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [projectsRes, usersRes] = await Promise.all([
        api.get('projects/'),
        api.get('users/').catch(() => ({ data: [] }))
      ]);
      setProjects(projectsRes.data);
      setUsers(usersRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      setLoading(false);
    }
  };

  // Преобразуем список юзеров для React-Select
  const userOptions = users.map(u => ({
    value: u.id,
    label: u.full_name || u.username
  }));

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

  const handleDeleteProject = async (id) => {
    if (!window.confirm("Удалить проект навсегда?")) return;
    try {
      await api.delete(`projects/${id}/`);
      setProjects(projects.filter(p => p.id !== id));
    } catch (error) {
      alert("Ошибка при удалении.");
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

  if (loading) return <div className="p-12 text-center text-gray-500">Загрузка...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Проекты</h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md transition-colors">
          + Создать проект
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-800 line-clamp-2">{project.title}</h3>
              <button onClick={() => handleDeleteProject(project.id)} className="text-red-400 hover:text-red-600 transition-colors ml-4">🗑️</button>
            </div>
            <p className="text-gray-600 text-sm mb-6 flex-1 line-clamp-3">{project.description || 'Без описания'}</p>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Новый проект</h3>
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                    <input type="text" value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
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
                    <textarea value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} className="w-full px-4 py-2 border rounded-lg min-h-[80px] outline-none" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Начало</label>
                      <input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн</label>
                      <input type="date" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-sm font-bold text-blue-800 mb-2">Видимость</label>
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full px-4 py-2 border border-blue-200 rounded-lg bg-white mb-4">
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
              <div className="flex justify-end space-x-3 pt-6 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Отмена</button>
                <button type="submit" className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold shadow-md transition-colors">Создать проект</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Projects;