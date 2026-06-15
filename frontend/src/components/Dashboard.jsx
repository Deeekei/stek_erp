import { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import api from '../api';

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Стейты для отчетов
  const [reportUserId, setReportUserId] = useState(null);
  const [reportProjectId, setReportProjectId] = useState(null);

  const [metrics, setMetrics] = useState({ total: 0, new_tasks: 0, in_progress: 0, completed: 0, overdue_count: 0 });
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [currentOverduePage, setCurrentOverduePage] = useState(1);
  const [totalOverduePages, setTotalOverduePages] = useState(1);

  const [news, setNews] = useState([]);
  const [currentNewsPage, setCurrentNewsPage] = useState(1);
  const [totalNewsPages, setTotalNewsPages] = useState(1);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [newNewsTitle, setNewNewsTitle] = useState('');
  const [newNewsContent, setNewNewsContent] = useState('');
  const [newNewsDescription, setNewNewsDescription] = useState('');
  const [newNewsImage, setNewNewsImage] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [canPostNews, setCanPostNews] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('new');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskPlanStart, setNewTaskPlanStart] = useState('');
  const [newTaskPlanEnd, setNewTaskPlanEnd] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(null);
  const [newTaskParticipants, setNewTaskParticipants] = useState([]);
  const [newTaskProject, setNewTaskProject] = useState(null);
  const [newTaskFiles, setNewTaskFiles] = useState([]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newCommentText, setNewCommentText] = useState('');

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState(null);
  const [completionDelayReason, setCompletionDelayReason] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const checkIsParticipant = (participantsArray, userId) => {
    if (!participantsArray || !Array.isArray(participantsArray)) return false;
    return participantsArray.some(p => {
      const pId = typeof p === 'object' ? p.id : p;
      return pId == userId;
    });
  };

  useEffect(() => {
    const initFast = async () => {
      setLoading(true);
      await Promise.all([fetchDashboardMetricsAndTasks(1), fetchNews(1)]);
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
    } catch (error) { console.error("Ошибка фоновой загрузки:", error); }
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

  // ФУНКЦИИ ВЫГРУЗКИ EXCEL
  const handleDownloadEmployeeReport = async () => {
    if (!reportUserId) return alert("Пожалуйста, выберите сотрудника!");
    try {
      const response = await api.get(`reports/employee/${reportUserId}/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Отчет_Сотрудник_${reportUserId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Ошибка при выгрузке отчета по сотруднику.");
    }
  };

  const handleDownloadProjectReport = async () => {
    if (!reportProjectId) return alert("Пожалуйста, выберите проект!");
    try {
      const response = await api.get(`reports/project/${reportProjectId}/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Отчет_Проект_${reportProjectId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Ошибка при выгрузке отчета по проекту.");
    }
  };

  const handleCreateNews = async (e) => {
    e.preventDefault();
    if (!newNewsTitle.trim() || !newNewsContent.trim()) return;
    const formData = new FormData();
    formData.append('title', newNewsTitle); formData.append('content', newNewsContent); formData.append('description', newNewsDescription);
    if (newNewsImage) formData.append('image', newNewsImage);

    try {
      await api.post('news/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      fetchNews(1); setIsNewsModalOpen(false); setNewNewsTitle(''); setNewNewsContent(''); setNewNewsDescription(''); setNewNewsImage(null);
    } catch (error) { alert("Ошибка публикации новости"); }
  };

  const handleDeleteNews = async (newsId) => {
    if (!window.confirm("Удалить новость навсегда?")) return;
    try { await api.delete(`news/${newsId}/`); setSelectedNews(null); fetchNews(currentNewsPage); }
    catch (error) { alert("Ошибка при удалении новости"); }
  };

  const userOptions = useMemo(() => users.map(u => {
    const fullName = `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.trim();
    return { value: u.id, label: fullName || u.username || u.email || `Сотрудник №${u.id}` };
  }), [users]);

  const projectOptions = useMemo(() => projects.map(p => ({ value: p.id, label: p.title })), [projects]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskProject) return alert("Пожалуйста, выберите проект для задачи!");
    const payload = {
      title: newTaskTitle, description: newTaskDescription, status: newTaskStatus, priority: newTaskPriority,
      project: parseInt(newTaskProject), plan_end_date: newTaskPlanEnd, assignee: newTaskAssignee, participants: newTaskParticipants
    };
    if (newTaskPlanStart) payload.plan_start_date = newTaskPlanStart;

    try {
      const response = await api.post('tasks/', payload);
      let createdTask = response.data;
      if (newTaskFiles.length > 0) {
        for (const file of newTaskFiles) {
          const formData = new FormData(); formData.append('file', file);
          await api.post(`tasks/${createdTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }
      fetchDashboardMetricsAndTasks(1);
      setIsTaskModalOpen(false);
      setNewTaskTitle(''); setNewTaskDescription(''); setNewTaskPlanStart(''); setNewTaskPlanEnd(''); setNewTaskAssignee(null); setNewTaskParticipants([]); setNewTaskProject(null); setNewTaskFiles([]);
    } catch (error) { alert("Ошибка при создании задачи."); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '', assignee: assigneeId || null, priority: task.priority || 'medium', participants: task.participants || [],
      project: task.project || null
    });
    setNewCommentText('');
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    const isOverdue = editingTask.plan_end_date && editingTask.plan_end_date < today;
    if (editFormData.status === 'completed' && isOverdue && editingTask.status !== 'completed') {
      setTaskToComplete(editingTask); setCompletionDelayReason(editingTask.delay_reason || ''); setIsCompletionModalOpen(true); setIsEditModalOpen(false); return;
    }
    const payload = { ...editFormData };
    if (!payload.plan_start_date) payload.plan_start_date = null;

    try {
      const response = await api.patch(`tasks/${editingTask.id}/`, payload);
      let updatedTask = response.data;

      if (editingTask.status !== editFormData.status) {
         const fullName = `${currentUser?.last_name || ''} ${currentUser?.first_name || ''}`.trim() || currentUser?.username || 'Сотрудник';
         let autoText = '';
         if (editFormData.status === 'in_progress') autoText = `⚙️ ${fullName} принял(а) задачу в работу`;
         if (editFormData.status === 'completed') autoText = `✅ ${fullName} завершил(а) задачу`;
         if (editFormData.status === 'new') autoText = `🔄 ${fullName} вернул(а) задачу в "Новые"`;
         if (autoText) {
             const commentRes = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: autoText });
             updatedTask.comments = [...(updatedTask.comments || []), commentRes.data];
         }
      }

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
      const response = await api.patch(`tasks/${taskToComplete.id}/`, payload);
      const fullName = `${currentUser?.last_name || ''} ${currentUser?.first_name || ''}`.trim() || currentUser?.username || 'Сотрудник';
      await api.post(`tasks/${taskToComplete.id}/add_comment/`, {
          text: `✅ ${fullName} завершил(а) задачу с просрочкой.\nПричина: ${completionDelayReason}`
      });

      setTaskToComplete(null); setCompletionDelayReason('');
      fetchDashboardMetricsAndTasks(currentOverduePage);
    } catch (error) { alert("Ошибка при сохранении."); }
  };

  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;
    try { await api.delete(`tasks/${taskId}/`); fetchDashboardMetricsAndTasks(currentOverduePage); setIsEditModalOpen(false); }
    catch (error) { alert("Ошибка при удалении."); }
  };

  const handleAddComment = async (e) => {
    if (e) e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedTask = { ...editingTask, comments: [...(editingTask.comments || []), response.data] };
      setEditingTask(updatedTask); setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t)); setNewCommentText('');
    } catch (error) { alert("Ошибка отправки."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await api.post(`tasks/${editingTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updatedTask = { ...editingTask, attachments: [...(editingTask.attachments || []), response.data] };
      setEditingTask(updatedTask); setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка загрузки"); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      const updatedTask = { ...editingTask, attachments: editingTask.attachments.filter(att => att.id !== attachmentId) };
      setEditingTask(updatedTask); setOverdueTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка при удалении файла."); }
  };

  const taskProject = editingTask ? projects.find(p => p.id === editingTask.project) : null;
  const isBossAll = isFullAccess || taskProject?.owner === currentUser?.id || taskProject?.manager === currentUser?.id || (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id));
  const isWorkerTask = editingTask?.assignee && typeof editingTask.assignee === 'object' ? editingTask.assignee.id == currentUser?.id : editingTask?.assignee == currentUser?.id;
  const isParticipantTask = checkIsParticipant(editingTask?.participants, currentUser?.id);

  const canEditAll = isBossAll;
  const canInteract = isBossAll || isWorkerTask || isParticipantTask;

  const getPriorityInfo = (priority) => {
    switch(priority) {
      case 'critical': return { label: 'Критичная', color: 'text-red-700 bg-red-100', icon: '🔴' };
      case 'high': return { label: 'Высокая', color: 'text-purple-700 bg-purple-100', icon: '🟣' };
      case 'low': return { label: 'Низкая', color: 'text-green-700 bg-green-100', icon: '🟢' };
      default: return { label: 'Средняя', color: 'text-blue-700 bg-blue-100', icon: '🔵' };
    }
  };

  const chartData = [
    { name: 'Новые', value: metrics.new_tasks, color: '#9CA3AF' },
    { name: 'В работе', value: metrics.in_progress, color: '#1d4ed8' },
    { name: 'Завершены', value: metrics.completed, color: '#16a34a' }
  ].filter(item => item.value > 0);

  // === ПРОВЕРКА РОЛЕЙ ДЛЯ ОТЧЕТОВ ===
  const isBoss = currentUser && ['admin', 'director'].includes(currentUser.role);
  const isManager = currentUser && currentUser.role === 'manager';
  const canSeeReports = isBoss || isManager || currentUser?.is_superuser;

  // Фильтруем проекты: Босс видит все. Менеджер видит только те, где он Owner или Manager.
  const reportProjectOptions = projects
    .filter(p => isBoss || p.manager === currentUser?.id || p.owner === currentUser?.id)
    .map(p => ({ value: p.id, label: p.title }));

  // Фильтруем юзеров: Босс видит всех. Менеджер видит только людей из своего отдела.
  const reportUserOptions = users
    .filter(u => {
      if (isBoss || currentUser?.is_superuser) return true;
      if (isManager) {
        return u.department === currentUser?.department;
      }
      return false;
    })
    .map(u => {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      return { value: u.id, label: fullName || u.username || `Сотрудник №${u.id}` };
    });

  if (loading) return <div className="p-4 sm:p-12 text-center text-gray-500 font-medium">Сборка дашборда...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 sm:mb-8 space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Добро пожаловать</h1>
          <p className="text-sm text-gray-500 mt-1">Сводка по вашим текущим задачам</p>
        </div>
        <button onClick={() => setIsTaskModalOpen(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md transition-colors">+ Новая задача</button>
      </div>

      {/* === БЛОК ОТЧЕТОВ ДЛЯ РУКОВОДСТВА === */}
      {canSeeReports && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6 sm:mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">📊 Аналитика и выгрузки</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 shadow-inner">
              <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Успеваемость сотрудника</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Select
                    options={reportUserOptions}
                    onChange={(opt) => setReportUserId(opt ? opt.value : null)}
                    placeholder={reportUserOptions.length > 0 ? "Выберите сотрудника..." : "В вашем отделе нет сотрудников"}
                    isDisabled={reportUserOptions.length === 0}
                    isClearable
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    menuPosition="fixed"
                  />
                </div>
                <button
                  onClick={handleDownloadEmployeeReport}
                  disabled={reportUserOptions.length === 0 || !reportUserId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition-colors whitespace-nowrap"
                >
                  📥 В Excel
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 shadow-inner">
              <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Сводка по проекту</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Select
                    options={reportProjectOptions}
                    onChange={(opt) => setReportProjectId(opt ? opt.value : null)}
                    placeholder={reportProjectOptions.length > 0 ? "Выберите проект..." : "У вас нет доступных проектов"}
                    isDisabled={reportProjectOptions.length === 0}
                    isClearable
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    menuPosition="fixed"
                  />
                </div>
                <button
                  onClick={handleDownloadProjectReport}
                  disabled={reportProjectOptions.length === 0 || !reportProjectId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition-colors whitespace-nowrap"
                >
                  📥 В Excel
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* ==================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-300 flex items-center space-x-5 relative overflow-hidden"><div className="absolute top-0 right-0 w-2 h-full bg-slate-400"></div><div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">📋</div><div><p className="text-lg sm:text-2xl text-slate-600 font-extrabold">Всего задач</p><p className="text-4xl sm:text-3xl font-black text-slate-800 mt-1">{metrics.total}</p></div></div>
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-blue-300 flex items-center space-x-5 relative overflow-hidden"><div className="absolute top-0 right-0 w-2 h-full bg-blue-500"></div><div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">⚙️</div><div><p className="text-lg sm:text-2xl text-blue-700 font-extrabold">В работе</p><p className="text-4xl sm:text-3xl font-black text-blue-800 mt-1">{metrics.in_progress}</p></div></div>
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-red-300 flex items-center space-x-5 relative overflow-hidden"><div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div><div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">🔥</div><div><p className="text-lg sm:text-2xl text-red-700 font-extrabold">Просрочено</p><p className="text-4xl sm:text-3xl font-black text-red-800 mt-1">{metrics.overdue_count}</p></div></div>
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-green-300 flex items-center space-x-5 relative overflow-hidden"><div className="absolute top-0 right-0 w-2 h-full bg-green-500"></div><div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-6xl shrink-0 shadow-sm">✅</div><div><p className="text-lg sm:text-2xl text-green-700 font-extrabold">Завершено</p><p className="text-4xl sm:text-3xl font-black text-green-800 mt-1">{metrics.completed}</p></div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 flex-1 pb-10">
        <div className="flex flex-col gap-6 sm:gap-8 h-full">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[320px] sm:h-[280px]">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Статусы ваших задач</h3>
            <div className="flex-1 w-full relative">
              {metrics.total > 0 ? (
                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} cx="40%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => [`${value} шт.`, 'Задач']} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ paddingRight: '10px' }} /></PieChart></ResponsiveContainer>
              ) : <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400"><span className="text-4xl mb-2">🤷‍♂️</span><p>У вас пока нет задач</p></div>}
            </div>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col flex-1 overflow-hidden min-h-[350px]">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800 flex items-center">📰 Новости компании</h3>
              {canPostNews && <button onClick={() => setIsNewsModalOpen(true)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors font-medium shrink-0 ml-2">Написать</button>}
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 sm:pr-2">
              {news.length > 0 ? (news.map(item => (
                  <div key={item.id} onClick={() => setSelectedNews(item)} className="p-4 bg-gray-100 border border-gray-100 rounded-xl hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-2"><h4 className="font-bold text-gray-800 text-sm leading-tight group-hover:text-blue-600 transition-colors break-words">{item.title}</h4><span className="text-[10px] text-gray-400 whitespace-nowrap ml-2 bg-white px-2 py-0.5 rounded-full border border-gray-100 shrink-0">{new Date(item.created_at).toLocaleDateString('ru-RU')}</span></div>
                    {item.image && <div className="mb-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-50"><img src={item.image} alt={item.title} className="w-full h-32 object-cover" /></div>}
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed line-clamp-3 break-words">{item.content}</p>
                    <p className="text-[10px] text-gray-400 mt-3 font-medium uppercase tracking-wider text-right">— {item.author_name}</p>
                  </div>
                ))
              ) : <p className="text-sm text-gray-400 italic text-center py-6">Новостей пока нет.</p>}
            </div>
            {totalNewsPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => fetchNews(Math.max(1, currentNewsPage - 1))} disabled={currentNewsPage === 1} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentNewsPage === 1 ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}>← Назад</button>
                <span className="text-xs font-medium text-gray-500">Стр. {currentNewsPage} из {totalNewsPages}</span>
                <button onClick={() => fetchNews(Math.min(totalNewsPages, currentNewsPage + 1))} disabled={currentNewsPage === totalNewsPages} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentNewsPage === totalNewsPages ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}>Вперед →</button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex-shrink-0">Быстрая сводка</h3>
          <ul className="space-y-4 mb-6 flex-shrink-0">
            <li className="flex justify-between items-center border-b border-gray-50 pb-3"><span className="text-gray-600">Новых задач:</span><span className="font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">{metrics.new_tasks}</span></li>
            <li className="flex justify-between items-center border-b border-gray-50 pb-3"><span className="text-gray-600">Задач в работе:</span><span className="font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{metrics.in_progress}</span></li>
          </ul>

          <div className="flex-1 flex flex-col overflow-hidden">
            <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-3 flex-shrink-0 flex items-center">🚨 Просроченные ({metrics.overdue_count}):</h4>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 overflow-x-hidden">
              {overdueTasks.length > 0 ? (
                overdueTasks.map(task => (
                  <div key={task.id} onClick={() => handleTaskClick(task)} className="p-3 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100/60 transition-all cursor-pointer flex justify-between items-start">
                    <div className="max-w-[70%]">
                      <p className="text-sm font-semibold text-gray-800 leading-tight mb-1 truncate break-words">{task.title}</p>
                      <p className="text-[11px] text-blue-600 truncate break-words"><Link to={`/projects/${task.project}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>📁 Перейти в проект</Link></p>
                    </div>
                    <div className="text-right flex-shrink-0"><span className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded font-bold">⏳ {task.plan_end_date}</span></div>
                  </div>
                ))
              ) : <p className="text-sm text-gray-400 italic py-4 text-center">Просроченные задачи отсутствуют 🎉</p>}
            </div>
            {totalOverduePages > 1 && (
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => fetchDashboardMetricsAndTasks(Math.max(1, currentOverduePage - 1))} disabled={currentOverduePage === 1} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentOverduePage === 1 ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}>← Назад</button>
                <span className="text-xs font-medium text-gray-500">Стр. {currentOverduePage} из {totalOverduePages}</span>
                <button onClick={() => fetchDashboardMetricsAndTasks(Math.min(totalOverduePages, currentOverduePage + 1))} disabled={currentOverduePage === totalOverduePages} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${currentOverduePage === totalOverduePages ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'}`}>Вперед →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- МОДАЛКА НОВОСТИ --- */}
      {selectedNews && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedNews(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative">
            <button onClick={() => setSelectedNews(null)} className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full w-8 h-8 flex items-center justify-center font-bold transition-colors z-10">✕</button>
            <div className="overflow-y-auto overflow-x-hidden p-5 sm:p-8 flex-1">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">Новость</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-800 mb-4 leading-tight break-words">{selectedNews.title}</h2>
              <div className="flex items-center text-xs text-gray-500 mb-6 font-medium space-x-4 border-b pb-4 flex-wrap gap-y-2"><span>Автор: <span className="text-gray-800">{selectedNews.author_name}</span></span><span>Дата: <span className="text-gray-800">{new Date(selectedNews.created_at).toLocaleDateString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></span></div>
              {selectedNews.image && (<div className="mb-6 rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50"><img src={selectedNews.image} alt={selectedNews.title} className="w-full max-h-[300px] sm:max-h-[400px] object-contain" /></div>)}
              <div className="text-gray-700 whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base">{selectedNews.description || selectedNews.content}</div>
            </div>
            <div className="bg-gray-50 p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
              <div className="w-full sm:w-auto">{canPostNews && (<button onClick={() => handleDeleteNews(selectedNews.id)} className="w-full sm:w-auto px-4 py-2 text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg font-medium transition-colors text-sm">🗑️ Удалить новость</button>)}</div>
              <button onClick={() => setSelectedNews(null)} className="w-full sm:w-auto px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА ПУБЛИКАЦИИ НОВОСТИ --- */}
      {isNewsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsNewsModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">Опубликовать новость</h3>
            <form onSubmit={handleCreateNews} className="space-y-4 sm:space-y-5">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Заголовок *</label><input type="text" value={newNewsTitle} onChange={(e) => setNewNewsTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 break-words" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Анонс (кратко) *</label><textarea value={newNewsContent} onChange={(e) => setNewNewsContent(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 min-h-[80px] break-words" required></textarea></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Подробный текст</label><textarea value={newNewsDescription} onChange={(e) => setNewNewsDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-800 min-h-[120px] sm:min-h-[160px] break-words"></textarea></div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 overflow-hidden"><label className="block text-sm font-medium text-gray-700 mb-2">Прикрепить картинку</label><input type="file" accept="image/*" onChange={(e) => setNewNewsImage(e.target.files[0])} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-white file:text-blue-700 hover:file:bg-gray-100 cursor-pointer" /></div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-50"><button type="button" onClick={() => setIsNewsModalOpen(false)} className="w-full sm:w-auto px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button><button type="submit" className="w-full sm:w-auto px-5 py-2 text-white bg-gray-800 hover:bg-gray-900 rounded-lg font-medium shadow-md transition-colors">Опубликовать</button></div>
            </form>
          </div>
        </div>
      )}

      {/* === ЕДИНАЯ МОДАЛКА РЕДАКТИРОВАНИЯ ЗАДАЧИ === */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 lg:p-8" onClick={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
              {canEditAll ? (
                <>
                  <div className="w-full md:w-2/3 flex flex-col bg-white border-r border-gray-200 min-h-0">
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">#{editingTask.id}</span>
                          <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded uppercase tracking-wide">📁 Проект: {taskProject?.title || editingTask.project}</span>
                        </div>
                        <button onClick={() => handleQuickDelete(editingTask.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ml-3">Удалить</button>
                      </div>

                      <form id="editForm" onSubmit={handleUpdateTask} className="space-y-4">
                        <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} className="w-full text-xl sm:text-2xl font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none pb-1 mb-2" placeholder="Название задачи" required />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Проект</label>
                            <Select options={projectOptions} value={projectOptions.find(o => o.value == editFormData.project) || null} onChange={(opt) => setEditFormData({...editFormData, project: opt ? opt.value : null})} placeholder="Выбрать проект..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                          </div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.assignee?.id ?? editFormData.assignee)) || null} onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => (editFormData.participants || []).includes(o.value))} onChange={(selected) => setEditFormData({...editFormData, participants: selected ? selected.map(s => s.value) : []})} placeholder="Добавить..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Статус</label>
                            <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="new">Новая</option><option value="in_progress">В работе</option><option value="completed">Завершена</option></select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Критичность</label>
                            <select value={editFormData.priority} onChange={(e) => setEditFormData({...editFormData, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option></select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Начало *</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Дедлайн *</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                        </div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Описание</label><textarea value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full p-2 border rounded min-h-[100px] break-words" /></div>
                      </form>

                      <div className="pt-4 mt-6 border-t border-gray-200">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📎 Прикрепленные файлы</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {editingTask.attachments && editingTask.attachments.length > 0 ? editingTask.attachments.map(att => (
                            <div key={att.id} className="relative text-xs bg-white border border-gray-200 px-3 py-2 rounded-lg flex flex-col shadow-sm group hover:border-blue-300 transition-colors">
                              {canInteract && <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10">✕</button>}
                              <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words"><span className="mr-2 text-base">📄</span> <span className="truncate">{att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}</span></a>
                            </div>
                          )) : <span className="text-xs text-gray-400 italic">Файлов нет</span>}
                        </div>
                        {canInteract && <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full" />}
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-1/3 flex flex-col bg-slate-50 min-h-0">
                    <div className="p-6 pb-2 flex-shrink-0 border-b border-gray-200"><h4 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">💬 Чат</h4></div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {editingTask.comments && editingTask.comments.length > 0 ? (
                        editingTask.comments.map(c => {
                          const isMe = currentUser && c.author_name && (
                            (currentUser.first_name && c.author_name.includes(currentUser.first_name)) ||
                            (currentUser.username && c.author_name.includes(currentUser.username))
                          );
                          return (
                            <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[90%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
                                {!isMe && <div className="font-bold text-xs text-blue-600 mb-1">{c.author_name}</div>}
                                <p className="whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-70"><span className="text-5xl mb-3">📭</span><p className="text-sm font-medium text-center">Тишина</p></div>}
                    </div>
                    {canInteract && (
                      <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
                        <div className="bg-slate-50 p-2 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                          <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                          <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-2">
                            <button onClick={handleAddComment} className="bg-blue-600 text-white px-5 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 w-full sm:w-auto">Отправить</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full md:w-2/3 flex flex-col bg-slate-50 border-r border-gray-200 min-h-0 order-2 md:order-1">
                    <div className="p-6 md:px-8 pb-4 flex-shrink-0 border-b border-gray-200 bg-white">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">#{editingTask.id}</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide ${isWorkerTask ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {isWorkerTask ? '👷‍♂️ Исполнитель' : '👀 Участник'}
                        </span>
                      </div>
                      <h2 className="text-2xl font-extrabold text-gray-900 leading-tight break-words">{editingTask.title}</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
                      {editingTask.comments && editingTask.comments.length > 0 ? (
                        editingTask.comments.map(c => {
                          const isMe = currentUser && c.author_name && (
                            (currentUser.first_name && c.author_name.includes(currentUser.first_name)) ||
                            (currentUser.username && c.author_name.includes(currentUser.username))
                          );
                          return (
                            <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
                                {!isMe && <div className="font-bold text-xs text-blue-600 mb-1">{c.author_name}</div>}
                                <p className="whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-70"><span className="text-5xl mb-3">📭</span><p className="text-sm font-medium">Здесь пока тихо. Напишите первым!</p></div>}
                    </div>

                    {canInteract && (
                      <div className="p-6 bg-white border-t border-gray-200 flex-shrink-0">
                        <div className="bg-slate-50 p-3 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                          <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать сообщение участникам..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                          <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-3">
                            <span className="text-xs text-gray-400 hidden sm:inline font-medium">Ctrl + Enter для отправки</span>
                            <button onClick={handleAddComment} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm w-full sm:w-auto">Отправить</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full md:w-1/3 p-6 md:p-8 overflow-y-auto bg-white flex flex-col order-1 md:order-2 min-h-0">
                    <div className={`mb-6 p-4 rounded-xl border ${isWorkerTask ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Статус задачи</label>
                      {isWorkerTask ? (
                        <form id="editForm" onSubmit={handleUpdateTask}>
                          <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-2 border border-blue-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 font-semibold cursor-pointer">
                            <option value="new">🆕 Новая</option><option value="in_progress">⚙️ В работе</option><option value="completed">✅ Завершена</option>
                          </select>
                        </form>
                      ) : (
                        <div className="text-sm font-semibold text-gray-800">
                          {editingTask.status === 'new' ? '🆕 Новая' : editingTask.status === 'in_progress' ? '⚙️ В работе' : '✅ Завершена'}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Сроки</span>
                        <span className="text-sm font-semibold text-gray-800">{editingTask.plan_start_date || '—'} → <span className={new Date(editingTask.plan_end_date) < new Date(today) && editingTask.status !== 'completed' ? 'text-red-500' : ''}>{editingTask.plan_end_date || '—'}</span></span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Критичность</span>
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${getPriorityInfo(editingTask.priority).color}`}>{getPriorityInfo(editingTask.priority).icon} {getPriorityInfo(editingTask.priority).label}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Ответственный</span>
                        <span className="text-sm font-semibold text-gray-800">{userOptions.find(o => o.value == (editingTask.assignee?.id ?? editingTask.assignee))?.label || 'Не назначен'}</span>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <span className="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">Проект</span>
                        <span className="text-sm font-semibold text-blue-900 truncate block"><Link to={`/projects/${editingTask.project}`} className="hover:underline">📁 {taskProject?.title || editingTask.project}</Link></span>
                      </div>
                    </div>

                    <div className="mb-6 flex-1">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Описание</span>
                      <div className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{editingTask.description || <span className="italic text-gray-400">Описание отсутствует.</span>}</div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 mt-auto">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📎 Вложения</h4>
                      <div className="flex flex-col gap-2 mb-3">
                        {editingTask.attachments && editingTask.attachments.length > 0 ? editingTask.attachments.map(att => (
                          <div key={att.id} className="relative text-xs bg-white border border-gray-200 px-3 py-2 rounded-lg flex flex-col shadow-sm group hover:border-blue-300 transition-colors">
                            {canInteract && <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10">✕</button>}
                            <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words"><span className="mr-2 text-base">📄</span> <span className="truncate">{att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}</span></a>
                          </div>
                        )) : <span className="text-xs text-gray-400 italic">Файлов нет</span>}
                      </div>
                      {canInteract && <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full" />}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row justify-end gap-3 flex-shrink-0">
             <button onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto px-6 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-colors border border-gray-300">Закрыть</button>
             {canEditAll && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить изменения</button>}
             {(!canEditAll && isWorkerTask) && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить статус</button>}
            </div>

          </div>
        </div>
      )}

      {/* --- МОДАЛКА СОЗДАНИЯ ЗАДАЧИ --- */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsTaskModalOpen(false); setNewTaskProject(null); setNewTaskParticipants([]); setNewTaskFiles([]); } }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">Новая задача</h3>
            <form onSubmit={handleCreateTask} className="space-y-4 sm:space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 break-words" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Проект *</label>
                  <Select
                    options={projects.filter(p => isFullAccess || p.owner === currentUser?.id || p.manager === currentUser?.id || (p.visibility === 'selected' && p.allowed_users?.includes(currentUser?.id))).map(p => ({ value: p.id, label: p.title }))}
                    value={projectOptions.find(o => o.value == newTaskProject) || null}
                    onChange={(opt) => setNewTaskProject(opt ? opt.value : null)}
                    placeholder="Поиск проекта..."
                    isSearchable
                    menuPosition="fixed"
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    noOptionsMessage={() => "Нет доступных проектов"}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
                  <Select options={userOptions} value={userOptions.find(o => o.value == newTaskAssignee) || null} onChange={(opt) => setNewTaskAssignee(opt ? opt.value : null)} placeholder="Поиск по ФИО..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Участники</label>
                  <Select isMulti options={userOptions} value={userOptions.filter(o => newTaskParticipants.includes(o.value))} onChange={(selected) => setNewTaskParticipants(selected ? selected.map(s => s.value) : [])} placeholder="Поиск..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Критичность</label>
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white">
                    <option value="low">🟢 Низкая</option>
                    <option value="medium">🔵 Средняя</option>
                    <option value="high">🟣 Высокая</option>
                    <option value="critical">🔴 Критичная</option>
                  </select>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дата начала (План)</label><input type="date" value={newTaskPlanStart} onChange={(e) => setNewTaskPlanStart(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн *</label><input type="date" value={newTaskPlanEnd} onChange={(e) => setNewTaskPlanEnd(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" required /></div>
              </div>
              <div className="border border-dashed border-gray-300 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <label className="block text-sm font-bold text-gray-700 mb-2">📎 Прикрепить файлы</label><input type="file" multiple onChange={(e) => setNewTaskFiles(Array.from(e.target.files))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" />
                {newTaskFiles.length > 0 && (<div className="mt-3 flex flex-wrap gap-2">{newTaskFiles.map((f, idx) => (<span key={idx} className="bg-white border border-gray-200 text-xs text-gray-600 px-2.5 py-1 rounded shadow-sm">📄 {f.name}</span>))}</div>)}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Описание</label><textarea value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg min-h-[80px] break-words"></textarea></div>
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-50"><button type="button" onClick={() => { setIsTaskModalOpen(false); setNewTaskProject(null); setNewTaskParticipants([]); setNewTaskFiles([]); }} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Отмена</button><button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-colors">Создать задачу</button></div>
            </form>
          </div>
        </div>
      )}

      {isCompletionModalOpen && taskToComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsCompletionModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 w-full max-w-md border-t-8 border-red-500">
            <h3 className="text-xl font-bold text-gray-800 mb-4 break-words">Задача просрочена</h3>
            <form onSubmit={handleConfirmCompletion}>
              <textarea value={completionDelayReason} onChange={(e) => setCompletionDelayReason(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] mb-6 text-sm break-words" placeholder="Укажите причину..." required />
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsCompletionModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Отмена</button><button type="submit" className="px-5 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg">Завершить</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;