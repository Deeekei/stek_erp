import { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import api from '../api';

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- НОВЫЕ СТЕЙТЫ ДЛЯ ОТЧЕТОВ ---
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

  // === НОВЫЕ ФУНКЦИИ ДЛЯ ВЫГРУЗКИ EXCEL ===
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
  // ========================================

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

  if (loading) return <div className="p-4 sm:p-12 text-center text-gray-500 font-medium">Сборка дашборда...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 sm:mb-8 space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Добро пожаловать</h1>
          <p className="text-sm text-gray-500 mt-1">Сводка по вашим текущим задачам</p>
        </div>
        <button onClick={() => setIsTaskModalOpen(true)} className="w-full sm:w-auto