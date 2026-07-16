import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import api from '../api';

// Импорты для календаря
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import ru from 'date-fns/locale/ru';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Настройка локализации календаря
const locales = { 'ru': ru };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);

  // === СТЕЙТЫ ОТОБРАЖЕНИЯ И ФИЛЬТРОВ ===
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban', 'types', 'list' или 'calendar'
  const [searchQuery, setSearchQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showOnlyActual, setShowOnlyActual] = useState(false);

  // === СТЕЙТЫ ДЛЯ СОРТИРОВКИ ТАБЛИЦЫ ===
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // === СТЕЙТЫ МОДАЛОК ===
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
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
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, projectsRes, usersRes] = await Promise.all([
        api.get('tasks/?assigned_to_me=true&no_page=true'),
        api.get('projects/'),
        api.get('users/').catch(() => ({ data: [] }))
      ]);

      const sortedTasks = [...(tasksRes.data.results || tasksRes.data)].sort((a, b) => {
        // УМНАЯ СОРТИРОВКА: Просроченные задачи всегда идут первыми
        const isAOverdue = a.plan_end_date && a.plan_end_date < today && a.status !== 'completed' && a.status !== 'delayed';
        const isBOverdue = b.plan_end_date && b.plan_end_date < today && b.status !== 'completed' && b.status !== 'delayed';

        if (isAOverdue && !isBOverdue) return -1;
        if (!isAOverdue && isBOverdue) return 1;

        const dateA = a.plan_start_date || a.plan_end_date;
        const dateB = b.plan_start_date || b.plan_end_date;

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return new Date(dateA) - new Date(dateB);
      });

      setTasks(sortedTasks);
      setProjects(projectsRes.data);

      const usersArray = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.results || []);
      setUsers(usersArray);

      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userId = payload.user_id;
          const userRole = payload.role;

          const current = usersArray.find(u => u.id == userId);
          if (current) {
            setCurrentUser(current);
            setIsFullAccess(current.role === 'admin' || current.role === 'director' || current.is_superuser);
          } else {
            setCurrentUser({ id: userId, role: userRole });
            setIsFullAccess(userRole === 'admin' || userRole === 'director');
          }
        } catch (e) { console.error("Auth error:", e); }
      }
      setLoading(false);
    } catch (error) { setLoading(false); }
  };

  const userOptions = useMemo(() => users.map(u => {
    const fullName = `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.trim();
    return { value: u.id, label: fullName || u.username || u.email || `Сотрудник №${u.id}` };
  }), [users]);

  const projectOptions = useMemo(() => projects.map(p => ({ value: p.id, label: p.title })), [projects]);

  // Вспомогательная функция для отображения имен в таблице
  const getUserName = (userField) => {
    if (!userField) return '—';
    const id = typeof userField === 'object' ? userField.id : userField;
    return userOptions.find(o => o.value == id)?.label || `Сотрудник №${id}`;
  };

  // === ФИЛЬТРАЦИЯ ЗАДАЧ ===
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const taskAssigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
      const taskExecutorId = task.executor && typeof task.executor === 'object' ? task.executor.id : task.executor;
      const isParticipant = checkIsParticipant(task.participants, currentUser?.id);
      const matchAssignee = taskAssigneeId == currentUser?.id || taskExecutorId == currentUser?.id || isParticipant;

      const matchCompleted = hideCompleted ? task.status !== 'completed' : true;

      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        task.title.toLowerCase().includes(query) ||
        task.id.toString().includes(query.replace('#', ''));

      let matchActual = true;
      if (showOnlyActual) {
        const hasStarted = !task.plan_start_date || task.plan_start_date <= today;
        const isNotFinished = task.status !== 'completed' && task.status !== 'delayed';
        matchActual = hasStarted && isNotFinished;
      }

      return matchAssignee && matchCompleted && matchActual && matchSearch;
    });
  }, [tasks, currentUser, hideCompleted, searchQuery, showOnlyActual, today]);


  // === СОРТИРОВКА ДЛЯ ТАБЛИЦЫ ===
  const sortedTasksForList = useMemo(() => {
    let sortableTasks = [...filteredTasks];

    if (sortConfig.key !== null) {
      sortableTasks.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'priority') {
          const weights = { low: 1, medium: 2, high: 3, critical: 4 };
          aValue = weights[a.priority] || 0;
          bValue = weights[b.priority] || 0;
        } else if (sortConfig.key === 'project') {
          aValue = (a.project_title || a.project || '').toString().toLowerCase();
          bValue = (b.project_title || b.project || '').toString().toLowerCase();
        } else if (sortConfig.key === 'status') {
          const weights = { new: 1, in_progress: 2, review: 3, delayed: 4, completed: 5, cancelled: 6 };
          aValue = weights[a.status] || 0;
          bValue = weights[b.status] || 0;
        } else if (sortConfig.key === 'assignee' || sortConfig.key === 'executor') {
          const idA = typeof a[sortConfig.key] === 'object' ? a[sortConfig.key]?.id : a[sortConfig.key];
          const idB = typeof b[sortConfig.key] === 'object' ? b[sortConfig.key]?.id : b[sortConfig.key];
          aValue = userOptions.find(o => o.value == idA)?.label?.toLowerCase() || '';
          bValue = userOptions.find(o => o.value == idB)?.label?.toLowerCase() || '';
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = (bValue || '').toLowerCase();
        }

        if (aValue === bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableTasks;
  }, [filteredTasks, sortConfig, userOptions]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnName) => {
    if (sortConfig.key === columnName) {
      return sortConfig.direction === 'asc' ? '↑' : '↓';
    }
    return <span className="opacity-0 group-hover:opacity-40 transition-opacity">↕</span>;
  };


  // === ФОРМАТИРОВАНИЕ ДЛЯ КАЛЕНДАРЯ ===
  const calendarEvents = useMemo(() => {
    return filteredTasks.map(task => {
      const startDate = new Date(task.plan_start_date || task.plan_end_date || today);
      const endDate = new Date(task.plan_end_date || task.plan_start_date || today);

      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

      return {
        id: task.id,
        title: `${task.is_milestone ? '🚩 ' : ''}${task.title}`,
        start: startDate,
        end: adjustedEndDate,
        allDay: true,
        resource: task,
      };
    });
  }, [filteredTasks, today]);

  // === ОБРАБОТКА DRAG & DROP ===
  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const taskId = parseInt(draggableId);
    const destinationId = destination.droppableId;
    const task = tasks.find(t => t.id === taskId);

    // ----------------------------------------------------
    // А) ЛОГИКА ДЛЯ РЕЖИМА «ТИПЫ ЗАДАЧ» (Меняем law_type)
    // ----------------------------------------------------
    if (viewMode === 'types') {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, law_type: destinationId } : t));
      try {
        await api.patch(`tasks/${taskId}/`, { law_type: destinationId });
      } catch (error) { alert("Ошибка смены типа задачи"); fetchData(); }
      return;
    }

    // ----------------------------------------------------
    // Б) КЛАССИЧЕСКАЯ ЛОГИКА КАНБАНА (Меняем status)
    // ----------------------------------------------------
    const isParticipant = (task.participants || []).some(p => (typeof p === 'object' ? p.id : p) == currentUser?.id);

    if (isParticipant) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: destinationId } : t));
      try {
        await api.patch(`tasks/${taskId}/`, { status: destinationId, personal_only: true });
      } catch (error) { alert("Не удалось обновить личный статус"); fetchData(); }
      return;
    }

    const taskProject = projects.find(p => p.id === task.project);
    const isBoss = isFullAccess ||
      taskProject?.owner === currentUser?.id ||
      taskProject?.manager === currentUser?.id ||
      (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id)) ||
      (taskProject?.visibility === 'all' && currentUser?.role === 'manager');

    const isWorker =
      (task.assignee && typeof task.assignee === 'object' ? task.assignee.id == currentUser?.id : task.assignee == currentUser?.id) ||
      (task.executor && typeof task.executor === 'object' ? task.executor.id == currentUser?.id : task.executor == currentUser?.id);

    if (!isBoss && !isWorker) return alert("Нет прав для действия.");

    const isOverdue = task.plan_end_date && task.plan_end_date < today;
    if (destinationId === 'completed' && isOverdue) {
      setTaskToComplete(task);
      setCompletionDelayReason(task.delay_reason || '');
      setIsCompletionModalOpen(true);
      return;
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: destinationId } : t));

    try {
      await api.patch(`tasks/${taskId}/`, { status: destinationId });
    } catch (error) { alert("Ошибка смены статуса."); fetchData(); }
  };

  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    if (!completionDelayReason.trim()) return alert("Укажите причину просрочки!");
    const payload = { status: 'completed', delay_reason: completionDelayReason, actual_end_date: today };
    setIsCompletionModalOpen(false);

    try {
      const response = await api.patch(`tasks/${taskToComplete.id}/`, payload);
      let updatedTask = response.data;

      const fullName = `${currentUser?.last_name || ''} ${currentUser?.first_name || ''}`.trim() || currentUser?.username || 'Сотрудник';
      const commentRes = await api.post(`tasks/${taskToComplete.id}/add_comment/`, {
          text: `✅ ${fullName} завершил(а) задачу с просрочкой.\nПричина: ${completionDelayReason}`
      });
      updatedTask.comments = [...(updatedTask.comments || []), commentRes.data];

      setTasks(prev => prev.map(t => t.id === taskToComplete.id ? updatedTask : t));
      setTaskToComplete(null); setCompletionDelayReason('');
    } catch (error) { alert("Ошибка."); fetchData(); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    const executorId = task.executor && typeof task.executor === 'object' ? task.executor.id : task.executor;

    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '',
      assignee: assigneeId || null,
      executor: executorId || null,
      participants: task.participants || [], priority: task.priority || 'medium',
      project: task.project || null, is_milestone: task.is_milestone || false,
      law_type: task.law_type || 'other'
    });
    setNewCommentText('');
    setIsEditMode(false);
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();

    const taskProject = projects.find(p => p.id === editingTask.project);
    const isBoss = isFullAccess ||
      taskProject?.owner === currentUser?.id ||
      taskProject?.manager === currentUser?.id ||
      (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id)) ||
      (taskProject?.visibility === 'all' && currentUser?.role === 'manager');

    if (isBoss) {
      if (!editFormData.plan_start_date || !editFormData.plan_end_date) return alert("Укажите даты.");
      if (new Date(editFormData.plan_start_date) > new Date(editFormData.plan_end_date)) return alert("Неверные даты.");
    }

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
      const response = await api.patch(`tasks/${editingTask.id}/`, payload);
      let updatedTask = response.data;
      setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
      setIsEditModalOpen(false); setEditingTask(null);
    } catch (error) { alert("Ошибка"); }
  };

  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;
    try { await api.delete(`tasks/${taskId}/`); setTasks(tasks.filter(t => t.id !== taskId)); setIsEditModalOpen(false); }
    catch (error) { alert("Ошибка при удалении."); }
  };

  const handleAddComment = async (e) => {
    if (e) e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedTask = { ...editingTask, comments: [...(editingTask.comments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t)); setNewCommentText('');
    } catch (error) { alert("Не удалось отправить комментарий."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await api.post(`tasks/${editingTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updatedTask = { ...editingTask, attachments: [...(editingTask.attachments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка файла"); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить этот файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      const updatedTask = { ...editingTask, attachments: editingTask.attachments.filter(att => att.id !== attachmentId) };
      setEditingTask(updatedTask);
      setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка при удалении файла."); }
  };

  const taskProject = editingTask ? projects.find(p => p.id === editingTask.project) : null;

  const isBossAll = isFullAccess ||
    taskProject?.owner === currentUser?.id ||
    taskProject?.manager === currentUser?.id ||
    (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id)) ||
    (taskProject?.visibility === 'all' && currentUser?.role === 'manager');

  const isWorkerTask =
    (editingTask?.assignee && (editingTask.assignee.id == currentUser?.id || editingTask.assignee == currentUser?.id)) ||
    (editingTask?.executor && (editingTask.executor.id == currentUser?.id || editingTask.executor == currentUser?.id));

  const isParticipantTask = checkIsParticipant(editingTask?.participants, currentUser?.id);
  const isLegal = isFullAccess || (
  Array.isArray(currentUser?.departments)
    ? currentUser.departments.some(dep =>
        dep === 'Юридический отдел' || dep?.name === 'Юридический отдел'
      )
    // На случай, если API всё еще отдает старое поле department как строку или ID
    : currentUser?.department === 'Юридический отдел' || currentUser?.department?.name === 'Юридический отдел');
  const canEditAll = isBossAll;
  const canInteract = true;

  const getPriorityInfo = (priority) => {
    switch(priority) {
      case 'critical': return { label: 'Критичная', color: 'text-red-700 bg-red-100', icon: '🔴' };
      case 'high': return { label: 'Высокая', color: 'text-purple-700 bg-purple-100', icon: '🟣' };
      case 'low': return { label: 'Низкая', color: 'text-green-700 bg-green-100', icon: '🟢' };
      default: return { label: 'Средняя', color: 'text-blue-700 bg-blue-100', icon: '🔵' };
    }
  };

  const kanbanColumns = [
    { id: 'new', title: 'Новые', color: 'border-gray-200 bg-gray-50' },
    { id: 'in_progress', title: 'В работе', color: 'border-blue-200 bg-blue-50' },
    { id: 'delayed', title: 'В отсрочке', color: 'border-orange-200 bg-orange-50' },
    { id: 'completed', title: 'Завершены', color: 'border-green-200 bg-green-50' }
  ];

  const typeColumns = [
    { id: 'other', title: 'Другое', color: 'border-gray-200 bg-gray-50' },
    { id: 'shareholders', title: 'Дольщики', color: 'border-blue-200 bg-blue-50' },
    { id: 'claims', title: 'Претензии', color: 'border-orange-200 bg-orange-50' },
    { id: 'courts', title: 'Суды', color: 'border-red-200 bg-red-50' }
  ];

  if (loading) return <div className="p-12 text-center text-gray-500">Загрузка ваших задач...</div>;

  return (
    <div className="h-full flex flex-col">
      {/* === ВЕРХНЯЯ ШАПКА === */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Мои задачи</h1>
          <p className="text-sm text-gray-500 mt-1">Все задачи, в которых вы назначены ответственным или участником</p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full xl:w-auto shrink-0">
          <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 w-full sm:w-auto">
            <button onClick={() => setViewMode('kanban')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Канбан</button>
            {isLegal && (
              <button onClick={() => setViewMode('types')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${viewMode === 'types' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Типы задач</button>
            )}
            <button onClick={() => setViewMode('list')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Список</button>
            <button onClick={() => setViewMode('calendar')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Календарь</button>
          </div>

          <div className="w-full sm:w-64 relative flex-1 sm:flex-none">
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            <input type="text" placeholder="Поиск по названию или номеру..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" />
          </div>
          <button onClick={() => setShowOnlyActual(!showOnlyActual)} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 border ${showOnlyActual ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}><span>⚡</span> {showOnlyActual ? 'Актуальные задачи' : 'Только актуальные'}</button>
          <label className="flex items-center text-sm font-bold text-gray-600 cursor-pointer select-none bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl shadow-sm transition-colors flex-1 sm:flex-none justify-center sm:justify-start">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="mr-2 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" /> 👁️ Скрыть завершенные
          </label>
        </div>
      </div>

      {/* 1. ВИД: СТАНДАРТНЫЙ КАНБАН */}
      {viewMode === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1 items-start">
            {kanbanColumns.map(column => {
              const columnTasks = filteredTasks.filter(task => task.status === column.id);
              return (
                <div key={column.id} className={`flex flex-col flex-shrink-0 w-80 rounded-xl border ${column.color} max-h-full`}>
                  <div className="p-4 font-bold text-gray-700 flex justify-between items-center border-b border-black/5">
                    {column.title} <span className="bg-white/60 px-2 py-0.5 rounded text-sm text-gray-500">{columnTasks.length}</span>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="p-3 flex-1 overflow-y-auto min-h-[200px]">
                        {columnTasks.map((task, index) => {
                          const isOverdue = task.plan_end_date < today && task.status !== 'completed' && task.status !== 'delayed';
                          const prioInfo = getPriorityInfo(task.priority);
                          return (
                            <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => handleTaskClick(task)} className={`bg-white p-4 mb-3 rounded-lg shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-100'} cursor-pointer hover:shadow-md transition-all`}>
                                  <div className="flex justify-between items-start mb-2"><span className={`px-2 py-0.5 text-[10px] uppercase rounded font-medium ${prioInfo.color}`}>{prioInfo.icon} {prioInfo.label}</span><span className="text-gray-400 text-xs font-medium">#{task.id}</span></div>
                                  <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug break-words">{task.is_milestone && <span className="mr-1" title="Веха">🚩</span>}{task.title}</h4>
                                  <div className="text-[11px] text-blue-600 font-medium mb-2 truncate"><Link to={`/projects/${task.project}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>📁 {task.project_title || `Проект #${task.project}`}</Link></div>
                                  <div className="flex justify-between items-center text-xs text-gray-500 font-medium mt-3 border-t pt-2 border-gray-50"><div className={isOverdue ? 'text-red-500 font-bold' : ''}>⏳ {task.plan_end_date || 'Нет срока'}</div>{task.comments?.length > 0 && <div>💬 {task.comments.length}</div>}</div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* === 1.2 НОВЫЙ ВИД: КАНБАН ПО ЮРИДИЧЕСКИМ ТИПАМ === */}
      {viewMode === 'types' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1 items-start">
            {typeColumns.map(column => {
              const columnTasks = filteredTasks.filter(task => task.law_type === column.id);
              return (
                <div key={column.id} className={`flex flex-col flex-shrink-0 w-80 rounded-xl border ${column.color} max-h-full`}>
                  <div className="p-4 font-bold text-gray-700 flex justify-between items-center border-b border-black/5">
                    {column.title} <span className="bg-white/60 px-2 py-0.5 rounded text-sm text-gray-500">{columnTasks.length}</span>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="p-3 flex-1 overflow-y-auto min-h-[200px]">
                        {columnTasks.map((task, index) => {
                          const isOverdue = task.plan_end_date < today && task.status !== 'completed' && task.status !== 'delayed';
                          const prioInfo = getPriorityInfo(task.priority);
                          return (
                            <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => handleTaskClick(task)} className={`bg-white p-4 mb-3 rounded-lg shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-100'} cursor-pointer hover:shadow-md transition-all`}>
                                  <div className="flex justify-between items-start mb-2"><span className={`px-2 py-0.5 text-[10px] uppercase rounded font-medium ${prioInfo.color}`}>{prioInfo.icon} {prioInfo.label}</span><span className="text-gray-400 text-xs font-medium">#{task.id}</span></div>
                                  <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug break-words">{task.is_milestone && <span className="mr-1" title="Веха">🚩</span>}{task.title}</h4>
                                  <div className="text-[11px] text-blue-600 font-medium mb-2 truncate"><Link to={`/projects/${task.project}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>📁 {task.project_title || `Проект #${task.project}`}</Link></div>
                                  <div className="flex justify-between items-center text-xs text-gray-500 font-medium mt-3 border-t pt-2 border-gray-50"><div className={isOverdue ? 'text-red-500 font-bold' : ''}>⏳ {task.plan_end_date || 'Нет срока'}</div>{task.comments?.length > 0 && <div>💬 {task.comments.length}</div>}</div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* 2. ВИД: СПИСОК (ОБНОВЛЕННЫЙ С НОВЫМИ КОЛОНКАМИ И СКРЫТЫМ БЕЙДЖЕМ) */}
      {viewMode === 'list' && (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-4 w-16 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('id')}>
                    <div className="flex items-center gap-1">№ <span className="text-blue-500 text-[11px]">{getSortIcon('id')}</span></div>
                  </th>
                  <th className="px-5 py-4 w-32 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('priority')}>
                    <div className="flex items-center gap-1">Приоритет <span className="text-blue-500 text-[11px]">{getSortIcon('priority')}</span></div>
                  </th>
                  <th className="px-5 py-4 min-w-[200px] cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('title')}>
                    <div className="flex items-center gap-1">Название <span className="text-blue-500 text-[11px]">{getSortIcon('title')}</span></div>
                  </th>
                  <th className="px-5 py-4 w-40 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('project')}>
                    <div className="flex items-center gap-1">Проект <span className="text-blue-500 text-[11px]">{getSortIcon('project')}</span></div>
                  </th>

                  {/* === НОВЫЕ КОЛОНКИ: ОТВЕТСТВЕННЫЙ И ИСПОЛНИТЕЛЬ === */}
                  <th className="px-5 py-4 w-36 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('assignee')}>
                    <div className="flex items-center gap-1">Ответственный <span className="text-blue-500 text-[11px]">{getSortIcon('assignee')}</span></div>
                  </th>
                  <th className="px-5 py-4 w-36 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('executor')}>
                    <div className="flex items-center gap-1">Исполнитель <span className="text-blue-500 text-[11px]">{getSortIcon('executor')}</span></div>
                  </th>
                  {/* ================================================== */}

                  <th className="px-5 py-4 w-32 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('status')}>
                    <div className="flex items-center gap-1">Статус <span className="text-blue-500 text-[11px]">{getSortIcon('status')}</span></div>
                  </th>
                  <th className="px-5 py-4 w-32 cursor-pointer group hover:bg-gray-200 transition-colors select-none" onClick={() => requestSort('plan_end_date')}>
                    <div className="flex items-center gap-1">Дедлайн <span className="text-blue-500 text-[11px]">{getSortIcon('plan_end_date')}</span></div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {sortedTasksForList.length > 0 ? (
                  sortedTasksForList.map(task => {
                    const prioInfo = getPriorityInfo(task.priority);
                    const isOverdue = task.plan_end_date && task.plan_end_date < today && task.status !== 'completed';
                    const taskProjectTitle = task.project_title || projects.find(p => p.id === task.project)?.title || `Проект #${task.project}`;

                    return (
                      <tr
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${isOverdue ? 'bg-red-50/40 hover:bg-red-100/50' : ''}`}
                      >
                        <td className="px-5 py-4 text-gray-400 font-medium">#{task.id}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-1 text-[10px] uppercase rounded font-bold whitespace-nowrap ${prioInfo.color}`}>
                            {prioInfo.icon} {prioInfo.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-800 break-words">
                            {task.is_milestone && <span className="mr-2" title="Веха">🚩</span>}
                            {task.title}
                          </div>
                          {/* Скрываем бейдж от тех, кто не юрист */}
                          {isLegal && task.law_type && task.law_type !== 'other' && (
                            <span className="inline-block text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded mt-1 font-semibold">
                              {task.law_type === 'shareholders' ? '👥 Дольщики' : task.law_type === 'claims' ? '📄 Претензии' : '⚖️ Суды'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Link to={`/projects/${task.project}`} className="text-blue-600 font-medium text-xs hover:underline truncate block max-w-[150px]" onClick={(e) => e.stopPropagation()}>
                            📁 {taskProjectTitle}
                          </Link>
                        </td>

                        {/* === ЯЧЕЙКИ: ОТВЕТСТВЕННЫЙ И ИСПОЛНИТЕЛЬ === */}
                        <td className="px-5 py-4 text-gray-700 font-medium text-[13px]">
                          {getUserName(task.assignee)}
                        </td>
                        <td className="px-5 py-4 text-gray-700 font-medium text-[13px]">
                          {getUserName(task.executor)}
                        </td>
                        {/* =========================================== */}

                        <td className="px-5 py-4">
                          {task.status === 'new' && <span className="text-gray-600 font-bold text-[11px] uppercase tracking-wider bg-gray-100 px-2.5 py-1 rounded-md whitespace-nowrap">Новая</span>}
                          {task.status === 'in_progress' && <span className="text-blue-600 font-bold text-[11px] uppercase tracking-wider bg-blue-100 px-2.5 py-1 rounded-md whitespace-nowrap">В работе</span>}
                          {task.status === 'delayed' && <span className="text-orange-600 font-bold text-[11px] uppercase tracking-wider bg-orange-100 px-2.5 py-1 rounded-md whitespace-nowrap">В отсрочке</span>}
                          {task.status === 'completed' && <span className="text-green-600 font-bold text-[11px] uppercase tracking-wider bg-green-100 px-2.5 py-1 rounded-md whitespace-nowrap">Завершена</span>}
                        </td>
                        <td className={`px-5 py-4 font-medium whitespace-nowrap ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          {isOverdue && <span className="mr-1">⏳</span>}
                          {task.plan_end_date || '—'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="8" className="px-5 py-12 text-center text-gray-400 font-medium text-base">
                      <span className="text-4xl block mb-2">📭</span> Подходящих задач не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ВИД: КАЛЕНДАРЬ */}
      {viewMode === 'calendar' && (
        <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-gray-200 min-h-[600px]">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            culture="ru"
            messages={{ next: "След.", previous: "Пред.", today: "Сегодня", month: "Месяц", week: "Неделя", day: "День", agenda: "Повестка" }}
            onSelectEvent={(event) => handleTaskClick(event.resource)}
            eventPropGetter={(event) => {
              const isOverdue = event.resource.plan_end_date < today && event.resource.status !== 'completed';
              const isCompleted = event.resource.status === 'completed';
              let backgroundColor = '#3b82f6';
              if (isCompleted) backgroundColor = '#10b981';
              else if (event.resource.status === 'new') backgroundColor = '#94a3b8';
              if (isOverdue) backgroundColor = '#ef4444';
              return { style: { backgroundColor, borderRadius: '6px', border: 'none', color: 'white', fontWeight: '600', fontSize: '13px', padding: '2px 6px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } };
            }}
          />
        </div>
      )}

      {/* === МОДАЛКА ПРОСМОТРА И РЕДАКТИРОВАНИЯ ЗАДАЧИ === */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 lg:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

              {canEditAll && isEditMode ? (
                <>
                  <div className="w-full md:w-2/3 flex flex-col bg-white border-r border-gray-200 min-h-0">
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2"><span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">#{editingTask.id}</span><span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded uppercase tracking-wide">📁 Проект: {taskProject?.title || editingTask.project}</span></div>
                        <button onClick={() => handleQuickDelete(editingTask.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ml-3">Удалить</button>
                      </div>

                      <form id="editForm" onSubmit={handleUpdateTask} className="space-y-4">
                        <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} className="w-full text-xl sm:text-2xl font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none pb-1 mb-2" placeholder="Название задачи" required />

                        <div className="flex items-center mb-4">
                          <input type="checkbox" id="my_is_milestone_edit" checked={editFormData.is_milestone || false} onChange={(e) => setEditFormData({...editFormData, is_milestone: e.target.checked})} className="mr-2 cursor-pointer w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                          <label htmlFor="my_is_milestone_edit" className="text-sm font-bold text-gray-700 cursor-pointer select-none">🚩 Отметить как веху (Milestone)</label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Проект</label><Select options={projectOptions} value={projectOptions.find(o => o.value == editFormData.project) || null} onChange={(opt) => setEditFormData({...editFormData, project: opt ? opt.value : null})} placeholder="Выбрать проект..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.assignee?.id ?? editFormData.assignee)) || null} onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Исполнитель</label><Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.executor?.id ?? editFormData.executor)) || null} onChange={(opt) => setEditFormData({...editFormData, executor: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                          <div className="sm:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => (editFormData.participants || []).includes(o.value))} onChange={(selected) => setEditFormData({...editFormData, participants: selected ? selected.map(s => s.value) : []})} placeholder="Добавить..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>

                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Статус</label>
                            <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                              <option value="new">Новая</option>
                              <option value="in_progress">В работе</option>
                              <option value="delayed">⏸️ В отсрочке</option>
                              <option value="completed">Завершена</option>
                            </select>
                          </div>
                          {/* Скрываем выбор типа от тех, кто не юрист */}
                          {isLegal && (
                            <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Тип правового отдела</label>
                              <select value={editFormData.law_type} onChange={(e) => setEditFormData({...editFormData, law_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                                <option value="other">⚪ Другое</option>
                                <option value="shareholders">👥 Дольщики</option>
                                <option value="claims">📄 Претензии</option>
                                <option value="courts">⚖️ Суды</option>
                              </select>
                            </div>
                          )}
                          <div className="sm:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Критичность</label><select value={editFormData.priority} onChange={(e) => setEditFormData({...editFormData, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option></select></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Начало *</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                          <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Дедлайн *</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                        </div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Описание</label><textarea value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full p-2 border rounded min-h-[100px] break-words" /></div>
                      </form>

                      <div className="pt-4 mt-6 border-t border-gray-200">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📎 Вложения</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {editingTask.attachments && editingTask.attachments.length > 0 ? editingTask.attachments.map(att => (
                            <div key={att.id} className="relative text-xs bg-white border border-gray-200 p-2.5 rounded-xl flex flex-col shadow-sm min-w-[150px] max-w-xs group hover:border-blue-300 transition-all">
                              {canInteract && (
                                <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10">✕</button>
                              )}
                              <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words mb-1.5">
                                <span className="mr-2 text-base shrink-0">📄</span>
                                <span className="truncate" title={att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}>
                                  {att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}
                                </span>
                              </a>

                              <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-1.5 mt-auto flex flex-col gap-0.5 font-medium">
                                <span className="truncate text-gray-500 flex items-center gap-1">
                                  <span>👤</span> {att.uploaded_by_name || 'Сотрудник'}
                                </span>
                                {att.upload_at && (
                                  <span className="flex items-center gap-1">
                                    <span>🕒</span>
                                    {new Date(att.upload_at).toLocaleDateString('ru-RU', {
                                      day: '2-digit', month: '2-digit', year: '2-digit',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                          )) : <span className="text-xs text-gray-400 italic">Файлов нет</span>}
                        </div>
                        <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full" />
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-1/3 flex flex-col bg-slate-50 min-h-0">
                    <div className="p-6 pb-2 flex-shrink-0 border-b border-gray-200"><h4 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">💬 Чат</h4></div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {editingTask.comments?.map(c => {
                        const isMe = currentUser && c.author_name && (
                          (currentUser.first_name && c.author_name.includes(currentUser.first_name)) ||
                          (currentUser.username && c.author_name.includes(currentUser.username))
                        );
                        return (
                          <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
                              <div className={`flex items-end gap-4 mb-1.5 ${isMe ? 'justify-end' : 'justify-between'}`}>
                                {!isMe && <span className="font-bold text-xs text-blue-600">{c.author_name}</span>}
                                {c.created_at && (
                                  <span className={`text-[10px] font-medium whitespace-nowrap ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {new Date(c.created_at).toLocaleString('ru-RU', {
                                      day: '2-digit', month: '2-digit', year: '2-digit',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
                            </div>
                          </div>
                        );
                      })}
                      {(!editingTask.comments || editingTask.comments.length === 0) && <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-70"><span className="text-5xl mb-3">📭</span><p className="text-sm font-medium text-center">Тишина</p></div>}
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
                        <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide ${isWorkerTask ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{isWorkerTask ? '👷‍♂️ Исполнитель/Ответственный' : '👀 Участник'}</span>
                        {canEditAll && (
                          <button onClick={() => setIsEditMode(true)} className="ml-auto text-xs bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-bold transition-colors border border-gray-200 shadow-sm flex items-center gap-1.5">
                            <span>✏️</span> Редактировать
                          </button>
                        )}
                      </div>
                      <h2 className="text-2xl font-extrabold text-gray-900 leading-tight break-words">{editingTask.is_milestone && <span className="mr-2" title="Веха">🚩</span>}{editingTask.title}</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
                      {editingTask.comments?.map(c => {
                        const isMe = currentUser && c.author_name && (
                          (currentUser.first_name && c.author_name.includes(currentUser.first_name)) ||
                          (currentUser.username && c.author_name.includes(currentUser.username))
                        );
                        return (
                          <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
                              <div className={`flex items-end gap-4 mb-1.5 ${isMe ? 'justify-end' : 'justify-between'}`}>
                                {!isMe && <span className="font-bold text-xs text-blue-600">{c.author_name}</span>}
                                {c.created_at && (
                                  <span className={`text-[10px] font-medium whitespace-nowrap ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {new Date(c.created_at).toLocaleString('ru-RU', {
                                      day: '2-digit', month: '2-digit', year: '2-digit',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
                            </div>
                          </div>
                        );
                      })}
                      {(!editingTask.comments || editingTask.comments.length === 0) && <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-70"><span className="text-5xl mb-3">📭</span><p className="text-sm font-medium text-center">Тишина</p></div>}
                    </div>

                    {canInteract && (
                      <div className="p-6 bg-white border-t border-gray-200 flex-shrink-0">
                        <div className="bg-slate-50 p-3 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                          <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Сообщение участникам..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                          <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-3">
                            <span className="text-xs text-gray-400 hidden sm:inline font-medium">Ctrl + Enter для отправки</span>
                            <button onClick={handleAddComment} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm w-full sm:w-auto">Отправить</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full md:w-1/3 p-6 md:p-8 overflow-y-auto bg-white flex flex-col order-1 md:order-2 min-h-0">
                    <div className={`mb-6 p-4 rounded-xl border ${isParticipantTask && !isWorkerTask && !isBossAll ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        {isParticipantTask && !isWorkerTask && !isBossAll ? 'Ваш личный статус' : 'Глобальный статус'}
                      </label>
                      {isWorkerTask || isParticipantTask || isBossAll ? (
                        <form id="editForm" onSubmit={handleUpdateTask}>
                          <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className={`w-full px-4 py-2 border rounded-lg bg-white shadow-sm focus:ring-2 outline-none font-semibold cursor-pointer ${editFormData.status === 'completed' ? 'border-green-300 text-green-900 focus:ring-green-500' : editFormData.status === 'in_progress' ? 'border-blue-300 text-blue-900 focus:ring-blue-500' : editFormData.status === 'delayed' ? 'border-orange-300 text-orange-900 focus:ring-orange-500' : 'border-gray-300 text-gray-800 focus:ring-gray-400'}`}>
                            <option value="new">🆕 Новая</option><option value="in_progress">⚙️ В работе</option><option value="delayed">⏸️ В отсрочке</option><option value="completed">✅ Завершена</option>
                          </select>
                        </form>
                      ) : (
                        <div className="text-sm font-semibold text-gray-800">
                          {editingTask.status === 'new' ? '🆕 Новая' :
                           editingTask.status === 'in_progress' ? '⚙️ В работе' :
                           editingTask.status === 'delayed' ? '⏸️ В отсрочке' : '✅ Завершена'}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Ответственный</span>
                        <span className="text-sm font-semibold text-gray-800">{userOptions.find(o => o.value == (editingTask.assignee?.id ?? editingTask.assignee))?.label || 'Не назначен'}</span>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Исполнитель</span>
                        <span className="text-sm font-semibold text-gray-800">{userOptions.find(o => o.value == (editingTask.executor?.id ?? editingTask.executor))?.label || 'Не назначен'}</span>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Участники</span>
                        {editingTask.participants && editingTask.participants.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {editingTask.participants.map((p, idx) => {
                              const pId = typeof p === 'object' ? p.id : p;
                              const pName = typeof p === 'object' && (p.first_name || p.last_name || p.username)
                                ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username
                                : userOptions.find(o => o.value == pId)?.label || `Сотрудник №${pId}`;

                              return (
                                <span key={idx} className="bg-white border border-gray-200 text-xs font-semibold text-gray-700 px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1 hover:border-blue-300 transition-colors">
                                  <span className="text-gray-400">👤</span>
                                  <span>{pName}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-sm font-semibold text-gray-400 italic">Нет участников</span>
                        )}
                      </div>

                      {/* Скрываем фиолетовый блок от тех, кто не юрист */}
                      {isLegal && (
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                          <span className="block text-[10px] text-purple-500 font-bold uppercase tracking-wider mb-1">Тип правового отдела</span>
                          <span className="text-sm font-semibold text-purple-900">
                            {editingTask.law_type === 'shareholders' && '👥 Дольщики'}
                            {editingTask.law_type === 'claims' && '📄 Претензии'}
                            {editingTask.law_type === 'courts' && '⚖️ Суды'}
                            {(editingTask.law_type === 'other' || !editingTask.law_type) && '⚪ Другое'}
                          </span>
                        </div>
                      )}

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100"><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Сроки</span><span className="text-sm font-semibold text-gray-800">{editingTask.plan_start_date || '—'} → <span className={new Date(editingTask.plan_end_date) < new Date(today) && editingTask.status !== 'completed' ? 'text-red-500' : ''}>{editingTask.plan_end_date || '—'}</span></span></div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100"><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Критичность</span><span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${getPriorityInfo(editingTask.priority).color}`}>{getPriorityInfo(editingTask.priority).icon} {getPriorityInfo(editingTask.priority).label}</span></div>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100"><span className="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">Проект</span><span className="text-sm font-semibold text-blue-900 truncate block"><Link to={`/projects/${editingTask.project}`} className="hover:underline">📁 {taskProject?.title || editingTask.project}</Link></span></div>
                    </div>

                    <div className="mb-6 flex-1"><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Описание</span><div className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{editingTask.description || <span className="italic text-gray-400">Описание отсутствует.</span>}</div></div>

                    <div className="pt-4 border-t border-gray-200 mt-auto">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📎 Вложения</h4>
                      <div className="flex flex-col gap-2 mb-3">
                        {editingTask.attachments && editingTask.attachments.length > 0 ? editingTask.attachments.map(att => (
                          <div key={att.id} className="relative text-xs bg-white border border-gray-200 p-2.5 rounded-xl flex flex-col shadow-sm min-w-[150px] max-w-xs group hover:border-blue-300 transition-all">
                              {canInteract && (
                                <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10">✕</button>
                              )}
                              <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words mb-1.5">
                                <span className="mr-2 text-base shrink-0">📄</span>
                                <span className="truncate" title={att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}>
                                  {att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}
                                </span>
                              </a>

                              <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-1.5 mt-auto flex flex-col gap-0.5 font-medium">
                                <span className="truncate text-gray-500 flex items-center gap-1">
                                  <span>👤</span> {att.uploaded_by_name || 'Сотрудник'}
                                </span>
                                {att.upload_at && (
                                  <span className="flex items-center gap-1">
                                    <span>🕒</span>
                                    {new Date(att.upload_at).toLocaleDateString('ru-RU', {
                                      day: '2-digit', month: '2-digit', year: '2-digit',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
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
              {canEditAll && isEditMode ? (
                <>
                  <button onClick={() => setIsEditMode(false)} className="w-full sm:w-auto px-6 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-colors border border-gray-300">Отмена</button>
                  <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить изменения</button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto px-6 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-colors border border-gray-300">Закрыть</button>
                  {(isWorkerTask || isParticipantTask) && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить статус</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === МОДАЛКА ПРОСРОЧКИ ЗАДАЧИ === */}
      {isCompletionModalOpen && taskToComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsCompletionModalOpen(false); }}>
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

export default MyTasks;