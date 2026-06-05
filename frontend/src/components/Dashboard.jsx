import { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import api from '../api';

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- СОСТОЯНИЯ ЗАДАЧ И МЕТРИК ---
  const [metrics, setMetrics] = useState({ total: 0, new_tasks: 0, in_progress: 0, completed: 0, overdue_count: 0 });
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [currentOverduePage, setCurrentOverduePage] = useState(1);
  const [totalOverduePages, setTotalOverduePages] = useState(1);

  // --- СОСТОЯНИЯ НОВОСТЕЙ ---
  const [news, setNews] = useState([]);
  const [currentNewsPage, setCurrentNewsPage] = useState(1);
  const [totalNewsPages, setTotalNewsPages] = useState(1);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [newNewsTitle, setNewNewsTitle] = useState('');
  const [newNewsContent, setNewNewsContent] = useState('');
  const [newNewsDescription, setNewNewsDescription] = useState('');
  const [newNewsImage, setNewNewsImage] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);

  // --- ПРАВА ДОСТУПА ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [canPostNews, setCanPostNews] = useState(false);

  // --- МОДАЛКИ ЗАДАЧ ---
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('new');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskPlanStart, setNewTaskPlanStart] = useState('');
  const [newTaskPlanEnd, setNewTaskPlanEnd] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(null);
  const [newTaskProject, setNewTaskProject] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newCommentText, setNewCommentText] = useState('');

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState(null);
  const [completionDelayReason, setCompletionDelayReason] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const initFast = async () => {
      setLoading(true);
      await Promise.all([
        fetchDashboardMetricsAndTasks(1),
        fetchNews(1)
      ]);
      setLoading(false);
      fetchProjectsAndUsers();
    };
    initFast();
  }, []);

  const fetchProjectsAndUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      let payload = null;
      let hasAdminFromToken = false;

      if (token) {
        try {
          payload = JSON.parse(atob(token.split('.')[1]));
          hasAdminFromToken = payload.role === 'admin' || payload.role === 'director' || payload.is_superuser === true;
          setIsFullAccess(hasAdminFromToken);
          setCanPostNews(hasAdminFromToken);
        } catch (e) { console.error("JWT Error:", e); }
      }

      const [projectsRes, usersRes] = await Promise.all([
        api.get('projects/'),
        api.get('users/').catch(() => ({ data: [] }))
      ]);
      setProjects(projectsRes.data);

      const usersArray = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.results || []);
      setUsers(usersArray);

      if (payload) {
        const current = usersArray.find(u => u.id == payload.user_id);
        if (current) {
          setCurrentUser(current);
          const hasAdminBackend = current.role === 'admin' || current.role === 'director' || current.is_superuser === true;
          setIsFullAccess(hasAdminBackend || hasAdminFromToken);
          setCanPostNews(hasAdminBackend || hasAdminFromToken || current.can_post_news === true);
        }
      }
    } catch (error) {
      console.error("Ошибка фоновой загрузки:", error);
    }
  };

  const fetchDashboardMetricsAndTasks = async (page) => {
    try {
      const [metricsRes, overdueRes] = await Promise.all([
        api.get('tasks/dashboard_metrics/'),
        api.get(`tasks/overdue/?page=${page}`)
      ]);
      setMetrics(metricsRes.data);
      setOverdueTasks(overdueRes.data.results || overdueRes.data);
      setTotalOverduePages(Math.ceil((overdueRes.data.count || 0) / 10) || 1);
      setCurrentOverduePage(page);
    } catch (error) {
      if (error.response?.status === 404 && page > 1) fetchDashboardMetricsAndTasks(page - 1);
    }
  };

  const fetchNews = async (page) => {
    try {
      const res = await api.get(`news/?page=${page}`);
      setNews(res.data.results || res.data);
      setTotalNewsPages(Math.ceil((res.data.count || 0) / 3) || 1);
      setCurrentNewsPage(page);
    } catch (error) {
      if (error.response?.status === 404 && page > 1) fetchNews(page - 1);
    }
  };

  const handleCreateNews = async (e) => {
    e.preventDefault();
    if (!newNewsTitle.trim() || !newNewsContent.trim()) return;

    const formData = new FormData();
    formData.append('title', newNewsTitle);
    formData.append('content', newNewsContent);
    formData.append('description', newNewsDescription);

    if (newNewsImage) {
      formData.append('image', newNewsImage);
    }

    try {
      await api.post('news/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchNews(1);
      setIsNewsModalOpen(false);
      setNewNewsTitle('');
      setNewNewsContent('');
      setNewNewsDescription('');
      setNewNewsImage(null);
    } catch (error) { alert("Ошибка публикации новости"); }
  };

  const handleDeleteNews = async (newsId) => {
    if (!window.confirm("Вы уверены, что хотите удалить эту новость навсегда?")) return;
    try {
      await api.delete(`news/${newsId}/`);
      setSelectedNews(null);
      fetchNews(currentNewsPage);
    } catch (error) {
      alert("Ошибка при удалении новости");
    }
  };

  const userOptions = useMemo(() => users.map(u => {
    const firstName = u.first_name || u.firstName || '';
    const lastName = u.last_name || u.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const directName = u.full_name || u.fullName || '';
    return { value: u.id, label: fullName || directName || u.username || u.email || `Сотрудник №${u.id}` };
  }), [users]);

  const projectOptions = useMemo(() => projects.map(p => ({
    value: p.id, label: p.title
  })), [projects]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskProject) return alert("Пожалуйста, выберите проект для задачи!");
    const payload = {
      title: newTaskTitle, description: newTaskDescription, status: newTaskStatus, priority: newTaskPriority,
      project: parseInt(newTaskProject), plan_end_date: newTaskPlanEnd, assignee: newTaskAssignee
    };
    if (newTaskPlanStart) payload.plan_start_date = newTaskPlanStart;

    try {
      await api.post('tasks/', payload);
      fetchDashboardMetricsAndTasks(1);
      setIsTaskModalOpen(false);
      setNewTaskTitle(''); setNewTaskDescription(''); setNewTaskPlanStart(''); setNewTaskPlanEnd(''); setNewTaskAssignee(null); setNewTaskProject(null);
    } catch (error) { alert("Ошибка при создании задачи."); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '', assignee: assigneeId || null, priority: task.priority || 'medium'
    });
    setNewCommentText('');
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    const isOverdue = editingTask.plan_end_date && editingTask.plan_end_date < today;
    if (editFormData.status === 'completed' && isOverdue && editingTask.status !== 'completed') {
      setTaskToComplete(editingTask);
      setCompletionDelayReason(editingTask.delay_reason || '');
      setIsCompletionModalOpen(true);
      setIsEditModalOpen(false);
      return;
    }

    const payload = { ...editFormData };
    if (!payload.plan_start_date) payload.plan_start_date = null;
    try {
      await api.patch(`tasks/${editingTask.id}/`, payload);
      fetchDashboardMetricsAndTasks(currentOverduePage);
      setIsEditModalOpen(false); setEditingTask(null);
    } catch (error) { alert("Ошибка сохранения."); }
  };

  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    if (!completionDelayReason.trim()) return alert("Необходимо указать причину просрочки!");
    const payload = { status: 'completed', delay_reason: completionDelayReason, actual_end_date: today };
    setIsCompletionModalOpen(false);
    try {
      await api.patch(`tasks/${taskToComplete.id}/`, payload);
      setTaskToComplete(null); setCompletionDelayReason('');
      fetchDashboardMetricsAndTasks(currentOverduePage);
    } catch (error) { alert("Ошибка при сохранении."); }
  };

  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;
    try {
      await api.delete(`tasks/${taskId}/`);
      fetchDashboardMetricsAndTasks(currentOverduePage);
      setIsEditModalOpen(false);
    } catch (error) { alert("Ошибка при удалении."); }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedComments = [...(editingTask.comments || []), response.data];
      const updatedTask = { ...editingTask, comments: updatedComments };
      setEditingTask(updatedTask);
      setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
      setNewCommentText('');
    } catch (error) { alert("Не удалось отправить комментарий."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await api.post(`tasks/${editingTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updatedTask = { ...editingTask, attachments: [...(editingTask.attachments || []), response.data] };
      setEditingTask(updatedTask);
      setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка загрузки файла"); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить этот файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      const updatedTask = { ...editingTask, attachments: editingTask.attachments.filter(att => att.id !== attachmentId) };
      setEditingTask(updatedTask);
      setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка при удалении файла."); }
  };

  const isAssignee = editingTask?.assignee && typeof editingTask.assignee === 'object'
    ? editingTask.assignee.id == currentUser?.id
    : editingTask?.assignee == currentUser?.id;

  const hasAdminView = isFullAccess;
  const canEdit = hasAdminView || isAssignee;

  const chartData = [
    { name: 'Новые', value: metrics.new_tasks, color: '#9CA3AF' },
    { name: 'В работе', value: metrics.in_progress, color: '#1d4ed8' },
    { name: 'Завершены', value: metrics.completed, color: '#16a34a' }
  ].filter(item => item.value > 0);

  if (loading) return <div className="p-4 sm:p-12 text-center text-gray-500 font-medium">Сборка дашборда...</div>;

  return (
    // Обертка с серым фоном. -m-4 и -m-8 компенсируют отступы из Layout.jsx, чтобы фон был везде
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 sm:mb-8 space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Добро пожаловать</h1>
          <p className="text-sm text-gray-500 mt-1">Сводка по вашим текущим задачам</p>
        </div>
        <button
          onClick={() => setIsTaskModalOpen(true)}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md transition-colors"
        >
          + Новая задача
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">

        {/* Всего задач */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-300 flex items-center space-x-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-slate-400"></div>
          <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">📋</div>
          <div>
            <p className="text-lg sm:text-2xl text-slate-600 font-extrabold">Всего задач</p>
            <p className="text-4xl sm:text-3xl font-black text-slate-800 mt-1">{metrics.total}</p>
          </div>
        </div>

        {/* В работе */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-blue-300 flex items-center space-x-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-blue-500"></div>
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">⚙️</div>
          <div>
            <p className="text-lg sm:text-2xl text-blue-700 font-extrabold">В работе</p>
            <p className="text-4xl sm:text-3xl font-black text-blue-800 mt-1">{metrics.in_progress}</p>
          </div>
        </div>

        {/* Просрочено */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-red-300 flex items-center space-x-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">🔥</div>
          <div>
            <p className="text-lg sm:text-2xl text-red-700 font-extrabold">Просрочено</p>
            <p className="text-4xl sm:text-3xl font-black text-red-800 mt-1">{metrics.overdue_count}</p>
          </div>
        </div>

        {/* Завершено */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-green-300 flex items-center space-x-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-green-500"></div>
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">✅</div>
          <div>
            <p className="text-lg sm:text-2xl text-green-700 font-extrabold">Завершено</p>
            <p className="text-4xl sm:text-3xl font-black text-green-800 mt-1">{metrics.completed}</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 flex-1 pb-10">

        {/* ЛЕВАЯ КОЛОНКА */}
        <div className="flex flex-col gap-6 sm:gap-8 h-full">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[320px] sm:h-[280px]">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Статусы ваших задач</h3>
            <div className="flex-1 w-full relative">
              {metrics.total > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Круг смещен левее, чтобы легенда влезла справа */}
                    <Pie data={chartData} cx="40%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} шт.`, 'Задач']} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ paddingRight: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <span className="text-4xl mb-2">🤷‍♂️</span><p>У вас пока нет задач</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 overflow-hidden min-h-[350px]">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800 flex items-center">📰 Новости компании</h3>
              {canPostNews && (
                <button
                  onClick={() => setIsNewsModalOpen(true)}
                  className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors font-medium shrink-0 ml-2"
                >
                  Написать
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 sm:pr-2">
              {news.length > 0 ? (
                news.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedNews(item)}
                    className="p-4 bg-gray-100 border border-gray-100 rounded-xl hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-gray-800 text-sm leading-tight group-hover:text-blue-600 transition-colors break-words">{item.title}</h4>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2 bg-white px-2 py-0.5 rounded-full border border-gray-100 shrink-0">
                        {new Date(item.created_at).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    {item.image && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        <img src={item.image} alt={item.title} className="w-full h-32 object-cover" />
                      </div>
                    )}
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed line-clamp-3 break-words">{item.content}</p>
                    <p className="text-[10px] text-gray-400 mt-3 font-medium uppercase tracking-wider text-right">— {item.author_name}</p>
                  </div>
                ))
              ) : <p className="text-sm text-gray-400 italic text-center py-6">Новостей пока нет.</p>}
            </div>

            {totalNewsPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={() => fetchNews(Math.max(1, currentNewsPage - 1))}
                  disabled={currentNewsPage === 1}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentNewsPage === 1 ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}
                >← Назад</button>
                <span className="text-xs font-medium text-gray-500">Стр. {currentNewsPage} из {totalNewsPages}</span>
                <button
                  onClick={() => fetchNews(Math.min(totalNewsPages, currentNewsPage + 1))}
                  disabled={currentNewsPage === totalNewsPages}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentNewsPage === totalNewsPages ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}
                >Вперед →</button>
              </div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА */}
        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex-shrink-0">Быстрая сводка</h3>
          <ul className="space-y-4 mb-6 flex-shrink-0">
            <li className="flex justify-between items-center border-b border-gray-50 pb-3">
              <span className="text-gray-600">Новых задач:</span>
              <span className="font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">{metrics.new_tasks}</span>
            </li>
            <li className="flex justify-between items-center border-b border-gray-50 pb-3">
              <span className="text-gray-600">Задач в работе:</span>
              <span className="font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{metrics.in_progress}</span>
            </li>
          </ul>

          <div className="flex-1 flex flex-col overflow-hidden">
            <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-3 flex-shrink-0 flex items-center">
              🚨 Просроченные задачи ({metrics.overdue_count}):
            </h4>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 overflow-x-hidden">
              {overdueTasks.length > 0 ? (
                overdueTasks.map(task => (
                  <div key={task.id} onClick={() => handleTaskClick(task)} className="p-3 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100/60 hover:border-red-200 transition-all cursor-pointer flex justify-between items-start">
                    <div className="max-w-[70%]">
                      <p className="text-sm font-semibold text-gray-800 leading-tight mb-1 truncate break-words">{task.title}</p>
                      <p className="text-[11px] text-blue-600 truncate break-words">
                        <Link to={`/projects/${task.project}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                          📁 Перейдите в проект, чтобы увидеть детали
                        </Link>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded font-bold">⏳ {task.plan_end_date}</span>
                    </div>
                  </div>
                ))
              ) : <p className="text-sm text-gray-400 italic py-4 text-center">Просроченные задачи на этой странице отсутствуют 🎉</p>}
            </div>

            {totalOverduePages > 1 && (
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={() => fetchDashboardMetricsAndTasks(Math.max(1, currentOverduePage - 1))}
                  disabled={currentOverduePage === 1}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentOverduePage === 1 ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}
                >← Назад</button>
                <span className="text-xs font-medium text-gray-500">Стр. {currentOverduePage} из {totalOverduePages}</span>
                <button
                  onClick={() => fetchDashboardMetricsAndTasks(Math.min(totalOverduePages, currentOverduePage + 1))}
                  disabled={currentOverduePage === totalOverduePages}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentOverduePage === totalOverduePages ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}
                >Вперед →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- МОДАЛКА ДЕТАЛЬНОГО ПРОСМОТРА НОВОСТИ --- */}
      {selectedNews && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedNews(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative">
            <button
              onClick={() => setSelectedNews(null)}
              className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-colors z-10"
            >
              ✕
            </button>

            <div className="overflow-y-auto overflow-x-hidden p-5 sm:p-8 flex-1">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">
                Новость
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-800 mb-4 leading-tight break-words">
                {selectedNews.title}
              </h2>

              <div className="flex items-center text-xs text-gray-500 mb-6 font-medium space-x-4 border-b pb-4 flex-wrap gap-y-2">
                <span>Автор: <span className="text-gray-800">{selectedNews.author_name}</span></span>
                <span>Дата: <span className="text-gray-800">{new Date(selectedNews.created_at).toLocaleDateString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></span>
              </div>

              {selectedNews.image && (
                <div className="mb-6 rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                  <img src={selectedNews.image} alt={selectedNews.title} className="w-full max-h-[300px] sm:max-h-[400px] object-contain" />
                </div>
              )}

              <div className="text-gray-700 whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base">
                {selectedNews.description || selectedNews.content}
              </div>
            </div>

            <div className="bg-gray-50 p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
              <div className="w-full sm:w-auto">
                {canPostNews && (
                  <button
                    onClick={() => handleDeleteNews(selectedNews.id)}
                    className="w-full sm:w-auto px-4 py-2 text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg font-medium transition-colors text-sm"
                  >
                    🗑️ Удалить новость
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedNews(null)} className="w-full sm:w-auto px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА ПУБЛИКАЦИИ НОВОСТИ --- */}
      {isNewsModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsNewsModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">Опубликовать новость</h3>
            <form onSubmit={handleCreateNews} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Заголовок *</label>
                  <input type="text" value={newNewsTitle} onChange={(e) => setNewNewsTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 break-words" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Анонс (кратко для ленты) *</label>
                  <textarea value={newNewsContent} onChange={(e) => setNewNewsContent(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 min-h-[80px] break-words" required placeholder="Отображается на карточке в ленте"></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Подробный текст статьи</label>
                  <textarea value={newNewsDescription} onChange={(e) => setNewNewsDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 min-h-[120px] sm:min-h-[160px] break-words" placeholder="Отображается при открытии новости. Можно оставить пустым."></textarea>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 overflow-hidden">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Прикрепить картинку (опционально)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewNewsImage(e.target.files[0])}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-white file:text-blue-700 hover:file:bg-gray-100 cursor-pointer"
                  />
                  <p className="text-xs text-blue-600 mt-2 font-medium break-words">💡 Рекомендуемый формат: 16:9, файлы JPG/PNG, до 5 МБ.</p>
                </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-50">
                <button type="button" onClick={() => setIsNewsModalOpen(false)} className="w-full sm:w-auto px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="w-full sm:w-auto px-5 py-2 text-white bg-gray-800 hover:bg-gray-900 rounded-lg font-medium shadow-md transition-colors">Опубликовать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ПОЛНАЯ МОДАЛКА РЕДАКТИРОВАНИЯ ЗАДАЧИ КАК В ПРОЕКТАХ --- */}
      {isEditModalOpen && editingTask && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-6 md:gap-8 overflow-x-hidden relative">
            {hasAdminView ? (
              <>
                <div className="flex-1 space-y-5 sm:space-y-6 pb-20 md:pb-0">
                  <div className="flex justify-between items-start border-b pb-4">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-800 break-words">#{editingTask.id} {editingTask.title}</h3>
                    <button onClick={() => handleQuickDelete(editingTask.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ml-3 shrink-0">Удалить</button>
                  </div>
                  <form id="editForm" onSubmit={handleUpdateTask} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Ответственный</label>
                        <Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.assignee?.id ?? editFormData.assignee)) || null} onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" menuPortalTarget={document.body} styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Статус</label>
                        <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="new">Новая</option><option value="in_progress">В работе</option><option value="completed">Завершена</option></select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm text-gray-700 mb-1">Критичность</label>
                        <select value={editFormData.priority} onChange={(e) => setEditFormData({...editFormData, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                          <option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="text-xs text-gray-500">Начало</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                      <div><label className="text-xs text-gray-500">Дедлайн</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                    </div>
                    <div><label className="block text-sm text-gray-700 mb-1">Описание</label><textarea value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full p-2 border rounded min-h-[80px] break-words" /></div>
                  </form>
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">📎 Вложения</h4>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {editingTask.attachments && editingTask.attachments.map(att => (
                        <div key={att.id} className="relative text-xs bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors flex flex-col shadow-sm min-w-[120px] max-w-xs group">
                          {canEdit && <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white shadow-sm font-bold z-10" title="Удалить файл">✕</button>}
                          <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-bold text-blue-600 mb-1 hover:underline truncate break-words"><span className="mr-2 text-lg">📄</span> <span className="truncate">{att.file ? att.file.split('/').pop() : `Файл ${att.id}`}</span></a>
                        </div>
                      ))}
                    </div>
                    <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors w-full" />
                  </div>
                </div>
                <div className="w-full md:w-80 border-t md:border-t-0 md:border-l pl-0 md:pl-6 flex flex-col bg-gray-50 -mx-5 sm:-mx-8 -mb-5 sm:-mb-8 md:-my-8 md:-mr-8 p-5 sm:p-8 pb-24 md:pb-8">
                  <h4 className="text-lg font-bold text-gray-800 mb-4 flex-shrink-0">💬 Обсуждение</h4>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
                    {editingTask.comments && editingTask.comments.length > 0 ? (editingTask.comments.map(c => (<div key={c.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-sm"><div className="flex justify-between items-center mb-1"><span className="font-bold text-blue-600 text-xs">{c.author_name}</span></div><p className="text-gray-700 whitespace-pre-wrap mt-1 break-words">{c.text}</p></div>))) : <div className="text-center text-xs text-gray-400 py-10">Нет комментариев</div>}
                  </div>
                  <div className="flex-shrink-0 bg-white p-2 rounded-xl border shadow-sm focus-within:ring-2 ring-blue-500 transition-shadow">
                    <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                    <div className="flex justify-between items-center mt-2 border-t pt-2"><span className="text-[10px] text-gray-400 hidden sm:inline">Ctrl+Enter</span><button onClick={handleAddComment} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors w-full sm:w-auto">Отправить</button></div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 flex flex-col space-y-6 pb-20 md:pb-0">
                  <div className="flex justify-between items-start border-b pb-4"><h3 className="text-xl sm:text-2xl font-bold text-gray-800 break-words">#{editingTask.id} {editingTask.title}</h3></div>
                  <div className="flex-1 flex flex-col border border-gray-200 rounded-xl shadow-sm overflow-hidden min-h-[300px] sm:min-h-[400px] bg-white">
                    <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center"><span className="text-lg mr-2">💬</span><h4 className="font-bold text-gray-700">Обсуждение задачи</h4></div>
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-white">
                      {editingTask.comments && editingTask.comments.length > 0 ? (editingTask.comments.map(c => (<div key={c.id} className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 text-sm"><div className="flex justify-between items-center mb-2"><span className="font-bold text-blue-600 text-sm">{c.author_name}</span></div><p className="text-gray-700 whitespace-pre-wrap break-words">{c.text}</p></div>))) : <div className="text-center text-sm text-gray-400 py-10 sm:py-16 flex flex-col items-center"><span className="text-4xl mb-3">📭</span>Здесь пока нет сообщений.</div>}
                    </div>
                    <div className="p-4 bg-gray-50 border-t border-gray-200 focus-within:bg-white transition-colors">
                      <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать сообщение участникам..." className="w-full text-sm outline-none resize-none min-h-[60px] sm:min-h-[80px] bg-transparent break-words" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200/60"><span className="text-xs text-gray-400 font-medium hidden sm:inline">Подсказка: Ctrl + Enter</span><button onClick={handleAddComment} className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-md">Отправить</button></div>
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-80 border-t md:border-t-0 md:border-l pl-0 md:pl-6 flex flex-col bg-gray-50 -mx-5 sm:-mx-8 -mb-5 sm:-mb-8 md:-my-8 md:-mr-8 p-5 sm:p-8 pb-24 md:pb-8 overflow-y-auto">
                  <h4 className="text-lg font-bold text-gray-800 mb-6 flex-shrink-0">Детали задачи</h4>
                  <div className="space-y-6">
                    <div className="bg-blue-100/60 text-blue-800 p-4 rounded-xl text-xs border border-blue-200 font-medium leading-relaxed"><span className="block mb-1 text-lg">👷‍♂️</span> Вы исполнитель. <br/>Следите за дедлайном.</div>
                    <div className="space-y-4">
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Ответственный</span><p className="font-semibold text-gray-800 text-sm break-words">{userOptions.find(o => o.value == (editingTask.assignee?.id ?? editingTask.assignee))?.label || 'Не назначен'}</p></div>
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Сроки</span><div className="flex items-center text-sm font-semibold text-gray-800 flex-wrap">{editingTask.plan_start_date || '—'} <span className="text-gray-400 mx-2">→</span> <span className={new Date(editingTask.plan_end_date) < new Date(today) && editingTask.status !== 'completed' ? 'text-red-500 font-bold' : ''}>{editingTask.plan_end_date || '—'}</span></div></div>
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Описание</span><div className="text-gray-700 text-xs whitespace-pre-wrap break-words bg-white p-3 rounded-lg border border-gray-200/60 shadow-sm min-h-[80px]">{editingTask.description || <span className="text-gray-400 italic">Описание отсутствует</span>}</div></div>
                    </div>
                    {isAssignee && (
                      <form id="editForm" onSubmit={handleUpdateTask} className="mt-8 pt-6 border-t border-gray-200">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Обновить статус</label>
                        <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-sm font-medium text-gray-700">
                          <option value="new">Новая</option><option value="in_progress">В работе</option><option value="completed">Завершена</option>
                        </select>
                      </form>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="fixed bottom-4 left-4 right-4 md:absolute md:bottom-10 md:left-1/2 md:transform md:-translate-x-1/2 flex flex-col sm:flex-row justify-center gap-3 z-[110] pointer-events-none">
             <button onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto px-6 py-2 md:px-8 md:py-3 bg-white text-gray-700 rounded-full shadow-xl font-bold hover:bg-gray-50 transition-all pointer-events-auto border border-gray-200">Закрыть</button>
             {canEdit && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 md:px-8 md:py-3 bg-blue-600 text-white rounded-full shadow-xl font-bold hover:bg-blue-700 transition-all pointer-events-auto">Сохранить</button>}
          </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА ПРИЧИНЫ ПРОСРОЧКИ --- */}
      {isCompletionModalOpen && taskToComplete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsCompletionModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 w-full max-w-md border-t-8 border-red-500 max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 break-words">Задача просрочена</h3>
            <form onSubmit={handleConfirmCompletion}>
              <textarea value={completionDelayReason} onChange={(e) => setCompletionDelayReason(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] mb-6 text-sm break-words" placeholder="Укажите причину..." required />
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button type="button" onClick={() => setIsCompletionModalOpen(false)} className="w-full sm:w-auto px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="w-full sm:w-auto px-5 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium shadow-md transition-colors">Завершить задачу</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА СОЗДАНИЯ ЗАДАЧИ --- */}
      {isTaskModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setIsTaskModalOpen(false); setNewTaskProject(null); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">Новая задача</h3>
            <form onSubmit={handleCreateTask} className="space-y-4 sm:space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 break-words" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Проект *</label>
                  <Select options={projectOptions} value={projectOptions.find(o => o.value == newTaskProject) || null} onChange={(opt) => setNewTaskProject(opt ? opt.value : null)} placeholder="Выберите проект..." isSearchable menuPosition="fixed" menuPortalTarget={document.body} styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
                  <Select options={userOptions} value={userOptions.find(o => o.value == newTaskAssignee) || null} onChange={(opt) => setNewTaskAssignee(opt ? opt.value : null)} placeholder="Выберите сотрудника..." isSearchable isClearable menuPosition="fixed" menuPortalTarget={document.body} styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Критичность</label>
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white">
                    <option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option>
                  </select>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Дата начала (План)</label>
                  <input type="date" value={newTaskPlanStart} onChange={(e) => setNewTaskPlanStart(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн *</label>
                  <input type="date" value={newTaskPlanEnd} onChange={(e) => setNewTaskPlanEnd(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none min-h-[80px] break-words"></textarea>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-50">
                <button type="button" onClick={() => setIsTaskModalOpen(false)} className="w-full sm:w-auto px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="w-full sm:w-auto px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-md transition-colors">Создать задачу</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;