import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Gantt, ViewMode } from 'gantt-task-react';
import Select from 'react-select';
import 'gantt-task-react/dist/index.css';
import api from '../api';

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const ganttContainerRef = useRef(null);

  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const scrollContainerRef = useRef(null);

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);

  const [currentView, setCurrentView] = useState('gantt');
  const [ganttZoom, setGanttZoom] = useState(ViewMode.Day);
  const [collapsedTasks, setCollapsedTasks] = useState([]);

  // Модалки Задач
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('new');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskPlanStart, setNewTaskPlanStart] = useState('');
  const [newTaskPlanEnd, setNewTaskPlanEnd] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(null);
  const [newTaskParent, setNewTaskParent] = useState('');
  const [newTaskLinkedTasks, setNewTaskLinkedTasks] = useState([]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newCommentText, setNewCommentText] = useState('');

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState(null);
  const [completionDelayReason, setCompletionDelayReason] = useState('');

  // Модалка Редактирования Проекта
  const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [projectRes, tasksRes, usersRes] = await Promise.all([
        api.get(`projects/${id}/`),
        api.get(`tasks/?project=${id}`),
        api.get(`users/`).catch(() => ({ data: [] }))
      ]);

      setProject(projectRes.data);
      setTasks(tasksRes.data);

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
            setIsFullAccess(current.role === 'admin' || current.role === 'director' || userId == projectRes.data.manager);
          } else {
            setCurrentUser({ id: userId, role: userRole });
            setIsFullAccess(userRole === 'admin' || userRole === 'director' || userId == projectRes.data.manager);
          }
        } catch (e) {
          console.error("Auth error:", e);
        }
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    if (!editProjectTitle.trim()) return alert("Название проекта не может быть пустым.");
    try {
      const response = await api.patch(`projects/${id}/`, { title: editProjectTitle });
      setProject(response.data);
      setIsProjectEditModalOpen(false);
    } catch (error) {
      alert("Ошибка при обновлении проекта.");
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm("⚠️ ВНИМАНИЕ! Вы уверены, что хотите удалить этот проект?")) return;
    try {
      await api.delete(`projects/${id}/`);
      navigate('/projects');
    } catch (error) {
      alert("Не удалось удалить проект.");
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    if (extension !== 'xml' && extension !== 'csv') {
        return alert("Система поддерживает только XML или CSV.");
    }

    const formData = new FormData();
    formData.append('file', file);
    const endpoint = extension === 'xml' ? 'import_xml/' : 'import_csv/';

    try {
      setLoading(true);
      await api.post(`projects/${id}/${endpoint}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert("Структура задач успешно загружена!");
      fetchData();
    } catch (error) {
      alert(`Ошибка при импорте: ${error.response?.data?.error || 'Проверьте формат файла'}`);
      setLoading(false);
    } finally {
      e.target.value = '';
    }
  };

  const userOptions = users.map(u => {
    const firstName = u.first_name || u.firstName || '';
    const lastName = u.last_name || u.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const directName = u.full_name || u.fullName || '';
    return { value: u.id, label: fullName || directName || u.username || u.email || `Сотрудник №${u.id}` };
  });

  const taskSelectOptions = tasks.map(t => ({
    value: t.id,
    label: `#${t.id} ${t.title}`
  }));

  const getParentId = (task) => {
    if (!task || !task.parent_task) return null;
    return typeof task.parent_task === 'object' ? task.parent_task.id : task.parent_task;
  };

  const orderedTasks = [];
  const addChildren = (parentId) => {
    const children = tasks.filter(t => getParentId(t) == parentId);
    children.forEach(child => { orderedTasks.push(child); addChildren(child.id); });
  };
  tasks.filter(t => !getParentId(t)).forEach(root => { orderedTasks.push(root); addChildren(root.id); });

  const isTaskHidden = (task) => {
    let current = task;
    while (current) {
      const pId = getParentId(current);
      if (!pId) break;
      if (collapsedTasks.includes(Number(pId))) return true;
      current = tasks.find(t => t.id == pId);
    }
    return false;
  };

  const handleExpanderClick = (task) => {
    setCollapsedTasks(prev => {
      const taskId = Number(task.id);
      return prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId];
    });
  };

  const getGanttStyles = (priority, isParent) => {
    let colors = {
      low: { bg: '#86efac', bgSel: '#4ade80', prog: '#22c55e', progSel: '#16a34a' },
      medium: { bg: '#93c5fd', bgSel: '#60a5fa', prog: '#3b82f6', progSel: '#2563eb' },
      high: { bg: '#d8b4fe', bgSel: '#c084fc', prog: '#a855f7', progSel: '#9333ea' },
      critical: { bg: '#fca5a5', bgSel: '#f87171', prog: '#ef4444', progSel: '#dc2626' }
    };
    const theme = colors[priority] || colors.medium;
    return {
      backgroundColor: isParent ? theme.prog : theme.bg,
      backgroundSelectedColor: isParent ? theme.progSel : theme.bgSel,
      progressColor: theme.prog,
      progressSelectedColor: theme.progSel
    };
  };

  const ganttTasks = orderedTasks
    .filter(t => t.plan_start_date && t.plan_end_date && !isTaskHidden(t))
    .map(t => {
      const pId = getParentId(t);
      const depsArray = t.linked_tasks || t.dependencies || [];
      const predecessors = depsArray.map(dep_id => dep_id.toString());
      const isParent = tasks.some(child => getParentId(child) == t.id);

      return {
        start: new Date(t.plan_start_date),
        end: new Date(t.plan_end_date),
        name: t.title,
        id: t.id.toString(),
        type: isParent ? 'project' : 'task',
        project: pId ? pId.toString() : undefined,
        hideChildren: collapsedTasks.includes(Number(t.id)),
        progress: t.status === 'completed' ? 100 : (t.status === 'in_progress' ? 50 : 0),
        dependencies: predecessors,
        styles: getGanttStyles(t.priority, isParent)
      };
    });

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      e.preventDefault();

      const deltaX = e.pageX - lastX.current;
      const deltaY = e.pageY - lastY.current;

      if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft -= deltaX;
      if (ganttContainerRef.current) ganttContainerRef.current.scrollTop -= deltaY;

      lastX.current = e.pageX;
      lastY.current = e.pageY;
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = 'grab';
      if (ganttContainerRef.current) ganttContainerRef.current.style.cursor = 'grab';
      document.body.style.removeProperty('user-select');
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleGanttPointerDown = (e) => {
    if (e.button !== 0) return;

    const outerContainer = ganttContainerRef.current;
    if (!outerContainer) return;

    const svg = outerContainer.querySelector('svg');
    const innerScrollContainer = svg?.parentElement;

    const className = (e.target.getAttribute('class') || '').toLowerCase();
    if (
      className.includes('bar') ||
      className.includes('progress') ||
      className.includes('wrapper') ||
      className.includes('handle') ||
      className.includes('arrow') ||
      e.target.tagName?.toLowerCase() === 'button'
    ) {
      return;
    }

    isDragging.current = true;
    lastX.current = e.pageX;
    lastY.current = e.pageY;
    scrollContainerRef.current = innerScrollContainer;

    outerContainer.style.cursor = 'grabbing';
    if (innerScrollContainer) innerScrollContainer.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const handleGanttWheel = (e) => {
    if (e.deltaX !== 0) return;
    if (e.deltaY !== 0 && e.shiftKey) {
      const svg = ganttContainerRef.current?.querySelector('svg');
      const innerScrollContainer = svg?.parentElement;
      if (innerScrollContainer) {
        e.preventDefault();
        innerScrollContainer.scrollLeft += e.deltaY;
      }
    }
  };

  const CustomTaskListHeader = ({ headerHeight, fontFamily, fontSize, rowWidth }) => {
    return (
      <div className="flex items-center border-b border-gray-200 border-r bg-gray-100 px-4 font-bold text-gray-700 text-sm" style={{ height: headerHeight, fontFamily, fontSize, width: rowWidth }}>
        <span>Проект</span>
      </div>
    );
  };

  const CustomTaskListTable = ({ rowHeight, rowWidth, fontFamily, fontSize, tasks: renderedTasks, onExpanderClick }) => {
    return (
      <div className="flex flex-col border-r border-gray-200 bg-white" style={{ fontFamily, fontSize, width: rowWidth }}>
        {renderedTasks.map((rt) => {
          let depth = 0;
          let current = rt;
          while (current && current.project) {
            depth++;
            current = renderedTasks.find(t => t.id === current.project);
          }

          const isFolder = rt.type === 'project';
          const originalTask = tasks.find(t => t.id.toString() === rt.id);

          const isOverdue = originalTask && originalTask.plan_end_date < today && originalTask.status !== 'completed';

          return (
            <div
              key={rt.id}
              className={`flex items-center border-b border-gray-100 px-2 group transition-colors ${
                isOverdue ? 'bg-red-50/70 hover:bg-red-100/70' : 'bg-white hover:bg-gray-50'
              }`}
              style={{ height: rowHeight }}
            >
              <div style={{ paddingLeft: `${depth * 15}px` }} className="flex items-center flex-1 overflow-hidden truncate">
                {isFolder ? (
                  <button onClick={() => onExpanderClick(rt)} className="mr-1 text-gray-400 hover:text-gray-800 focus:outline-none w-4 shrink-0">
                    {rt.hideChildren ? '▶' : '▼'}
                  </button>
                ) : <span className="w-5 shrink-0 inline-block"></span>}
                <span className="mr-1 sm:mr-2 text-base shrink-0">{isFolder ? '📁' : '📄'}</span>
                <span
                  className={`truncate cursor-pointer hover:text-blue-600 transition-colors text-xs sm:text-[13px] ${
                    isFolder ? 'font-bold text-gray-900' : isOverdue ? 'text-red-700 font-medium' : 'font-medium text-gray-700'
                  }`}
                  onClick={() => originalTask && handleTaskClick(originalTask)}
                  title={rt.name}
                >
                  {rt.name}
                </span>
              </div>

              {isFullAccess && (
                <div className={`opacity-0 group-hover:opacity-100 flex items-center space-x-1 pl-1 sm:pl-2 shrink-0 ${
                  isOverdue ? 'bg-red-100/40' : 'bg-gray-50'
                }`}>
                  <button onClick={(e) => { e.stopPropagation(); setNewTaskParent(rt.id); setIsTaskModalOpen(true); }} className="text-blue-500 hover:bg-blue-100 w-5 sm:w-6 h-5 sm:h-6 rounded flex items-center justify-center font-bold" title="Вложенная задача">➕</button>
                  <button onClick={(e) => { e.stopPropagation(); handleQuickDelete(rt.id); }} className="text-red-500 hover:bg-red-100 w-5 sm:w-6 h-5 sm:h-6 rounded flex items-center justify-center font-bold" title="Удалить">🗑️</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleGanttDateChange = async (ganttTask) => {
    if (!isFullAccess) return alert("У вас нет прав для изменения сроков.");
    const payload = { plan_start_date: ganttTask.start.toISOString().split('T')[0], plan_end_date: ganttTask.end.toISOString().split('T')[0] };
    try {
      const response = await api.patch(`tasks/${ganttTask.id}/`, payload);
      setTasks(prevTasks => prevTasks.map(t => t.id === Number(ganttTask.id) ? response.data : t));
    } catch (error) {
      alert("Ошибка сохранения");
      fetchData();
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const task = tasks.find(t => t.id === taskId);

    const isBoss = isFullAccess;
    const taskAssigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    const isWorker = taskAssigneeId == currentUser?.id;

    if (!isBoss && !isWorker) return alert("Нет прав для смены статуса.");

    const isOverdue = task.plan_end_date && task.plan_end_date < today;
    if (newStatus === 'completed' && isOverdue) {
      setTaskToComplete(task); setCompletionDelayReason(task.delay_reason || ''); setIsCompletionModalOpen(true); return;
    }

    setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try { await api.patch(`tasks/${taskId}/`, { status: newStatus }); } catch (error) { fetchData(); }
  };

  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    if (!completionDelayReason.trim()) return alert("Укажите причину просрочки!");
    const payload = { status: 'completed', delay_reason: completionDelayReason, actual_end_date: today };
    setTasks(prevTasks => prevTasks.map(t => t.id === taskToComplete.id ? { ...t, ...payload } : t));
    setIsCompletionModalOpen(false);
    try {
      const response = await api.patch(`tasks/${taskToComplete.id}/`, payload);
      setTasks(prevTasks => prevTasks.map(t => t.id === taskToComplete.id ? response.data : t));
      setTaskToComplete(null);
      setCompletionDelayReason('');
    }
    catch (error) { fetchData(); }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();

    if (!newTaskPlanStart || !newTaskPlanEnd) {
      return alert("Необходимо указать дату начала и дедлайн задачи.");
    }
    if (new Date(newTaskPlanStart) > new Date(newTaskPlanEnd)) {
      return alert("Дата начала не может быть позже дедлайна.");
    }

    const payload = {
      title: newTaskTitle, description: newTaskDescription, status: newTaskStatus, priority: newTaskPriority,
      project: parseInt(id), plan_start_date: newTaskPlanStart, plan_end_date: newTaskPlanEnd, assignee: newTaskAssignee,
      parent_task: newTaskParent ? parseInt(newTaskParent) : null,
      linked_tasks: newTaskLinkedTasks
    };

    try {
      const response = await api.post('tasks/', payload);
      setTasks(prevTasks => [...prevTasks, response.data]);
      setIsTaskModalOpen(false);
      setNewTaskTitle(''); setNewTaskDescription(''); setNewTaskPlanStart(''); setNewTaskPlanEnd('');
      setNewTaskAssignee(null); setNewTaskParent(''); setNewTaskLinkedTasks([]);
    } catch (error) { alert(`Ошибка: ${JSON.stringify(error.response?.data)}`); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    const depsArray = task.linked_tasks || task.dependencies || [];

    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '', assignee: assigneeId || null, priority: task.priority || 'medium',
      linked_tasks: depsArray
    });
    setNewCommentText(''); setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();

    if (!editFormData.plan_start_date || !editFormData.plan_end_date) {
      return alert("Необходимо указать дату начала и дедлайн задачи.");
    }
    if (new Date(editFormData.plan_start_date) > new Date(editFormData.plan_end_date)) {
      return alert("Дата начала не может быть позже дедлайна.");
    }

    const isOverdue = editingTask.plan_end_date && editingTask.plan_end_date < today;
    if (editFormData.status === 'completed' && isOverdue && editingTask.status !== 'completed') {
      setTaskToComplete(editingTask); setCompletionDelayReason(editingTask.delay_reason || ''); setIsCompletionModalOpen(true); setIsEditModalOpen(false); return;
    }
    const payload = { ...editFormData };
    try {
      const response = await api.patch(`tasks/${editingTask.id}/`, payload);
      setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? response.data : t));
      setIsEditModalOpen(false);
      setEditingTask(null);
    }
    catch (error) { alert("Ошибка сохранения"); }
  };

  // ОПТИМИЗИРОВАНО: Мгновенное удаление задачи с экрана
  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;

    const numericId = Number(taskId);

    // Сначала мгновенно убираем из стейта
    setTasks(prevTasks => prevTasks.filter(t => t.id !== numericId));
    setIsEditModalOpen(false);

    try {
      // Затем тихо отправляем запрос на сервер
      await api.delete(`tasks/${numericId}/`);
    } catch (error) {
      alert("Не удалось удалить задачу на сервере.");
      fetchData(); // Восстанавливаем данные при ошибке
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedComments = [...(editingTask.comments || []), response.data];
      const updatedTask = { ...editingTask, comments: updatedComments };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t)); setNewCommentText('');
    } catch (error) { alert("Не удалось отправить комментарий."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await api.post(`tasks/${editingTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updatedTask = { ...editingTask, attachments: [...(editingTask.attachments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка загрузки файла"); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить этот файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      const updatedTask = { ...editingTask, attachments: editingTask.attachments.filter(att => att.id !== attachmentId) };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка при удалении файла."); }
  };

  const isAssignee = editingTask?.assignee && typeof editingTask.assignee === 'object'
    ? editingTask.assignee.id == currentUser?.id
    : editingTask?.assignee == currentUser?.id;

  const hasAdminView = isFullAccess;
  const canEdit = hasAdminView || isAssignee;

  const kanbanColumns = [
    { id: 'new', title: 'Новые', color: 'border-gray-200 bg-gray-50' },
    { id: 'in_progress', title: 'В работе', color: 'border-blue-200 bg-blue-50' },
    { id: 'completed', title: 'Завершены', color: 'border-green-200 bg-green-50' }
  ];

  if (loading) return <div className="p-4 sm:p-12 text-center text-gray-500 font-medium">Загрузка данных проекта...</div>;
  if (!project) return <div className="p-4 sm:p-12 text-center text-red-500">Проект не найден.</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-500 mb-1"><Link to="/projects" className="hover:text-blue-600">Проекты</Link> <span className="mx-2">/</span> {project.title}</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 break-words">{project.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <input type="file" accept=".xml,.csv" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          {isFullAccess && (
            <>
              <button onClick={() => fileInputRef.current.click()} className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap">📥 Импорт</button>

              <button
                onClick={() => { setEditProjectTitle(project.title); setIsProjectEditModalOpen(true); }}
                className="flex-1 sm:flex-none px-4 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap"
              >
                ✏️ Изменить
              </button>

              <button onClick={handleDeleteProject} className="flex-1 sm:flex-none px-4 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap">🗑️ Удалить</button>
            </>
          )}
          <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto justify-center">
            <button onClick={() => setCurrentView('gantt')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentView === 'gantt' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Гант</button>
            <button onClick={() => setCurrentView('board')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentView === 'board' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Канбан</button>
          </div>
          {isFullAccess && <button onClick={() => { setNewTaskParent(''); setIsTaskModalOpen(true); }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md whitespace-nowrap">+ Задача</button>}
        </div>
      </div>

      {currentView === 'board' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1 items-start">
            {kanbanColumns.map(column => {
              const columnTasks = tasks.filter(task => task.status === column.id);
              return (
                <div key={column.id} className={`flex flex-col flex-shrink-0 w-72 sm:w-80 rounded-xl border ${column.color} max-h-full`}>
                  <div className="p-3 sm:p-4 font-bold text-gray-700 flex justify-between items-center border-b border-black/5">
                    {column.title} <span className="bg-white/60 px-2 py-0.5 rounded text-sm text-gray-500">{columnTasks.length}</span>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="p-2 sm:p-3 flex-1 overflow-y-auto min-h-[200px]">
                        {columnTasks.map((task, index) => {
                          const isOverdue = task.plan_end_date < today && task.status !== 'completed';
                          return (
                            <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => handleTaskClick(task)} className={`bg-white p-3 sm:p-4 mb-3 rounded-lg shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-100'} cursor-pointer hover:shadow-md transition-all`}>
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex space-x-1">
                                      <span className={`px-2 py-0.5 text-[10px] uppercase rounded ${task.priority === 'low' ? 'bg-green-100 text-green-700' : task.priority === 'high' ? 'bg-purple-100 text-purple-700 font-bold' : task.priority === 'critical' ? 'bg-red-100 text-red-700 font-bold' : 'bg-blue-100 text-blue-700'}`}>
                                        {task.priority === 'low' ? '🟢' : task.priority === 'medium' ? '🔵' : task.priority === 'high' ? '🟣' : '🔴'}
                                      </span>
                                    </div>
                                    <span className="text-gray-400 text-xs shrink-0 ml-2">#{task.id}</span>
                                  </div>
                                  <h4 className="font-semibold text-gray-800 text-sm mb-1 break-words">{task.title}</h4>
                                  <div className="flex justify-between text-xs text-gray-500 font-medium mt-2">
                                    <div className={isOverdue ? 'text-red-500 font-bold' : ''}>⏳ {task.plan_end_date}</div>
                                    {task.comments?.length > 0 && <div>💬 {task.comments.length}</div>}
                                  </div>
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

      {currentView === 'gantt' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 flex-1 overflow-hidden flex flex-col relative">
           <div className="mb-3 sm:mb-4 flex justify-end gap-2 overflow-x-auto pb-1">
            <button onClick={() => setGanttZoom(ViewMode.Day)} className={`px-3 py-1 text-xs sm:text-sm rounded whitespace-nowrap ${ganttZoom === ViewMode.Day ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Дни</button>
            <button onClick={() => setGanttZoom(ViewMode.Week)} className={`px-3 py-1 text-xs sm:text-sm rounded whitespace-nowrap ${ganttZoom === ViewMode.Week ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Недели</button>
            <button onClick={() => setGanttZoom(ViewMode.Month)} className={`px-3 py-1 text-xs sm:text-sm rounded whitespace-nowrap ${ganttZoom === ViewMode.Month ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Месяцы</button>
          </div>

          <div
            className="flex-1 overflow-auto relative select-none"
            ref={ganttContainerRef}
            onPointerDownCapture={handleGanttPointerDown}
            onWheelCapture={handleGanttWheel}
          >
            {ganttTasks.length > 0 ? (
              <Gantt
                tasks={ganttTasks}
                viewMode={ganttZoom}
                onDateChange={handleGanttDateChange}
                onExpanderClick={handleExpanderClick}
                TaskListHeader={CustomTaskListHeader}
                TaskListTable={CustomTaskListTable}
                listCellWidth={isMobile ? 180 : 380}
                locale="ru"
              />
            ) : <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium">Задачи без указанных дат не отображаются в Ганте.</div>}
          </div>
        </div>
      )}

      {/* --- МОДАЛКА РЕДАКТИРОВАНИЯ ПРОЕКТА --- */}
      {isProjectEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsProjectEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Изменить проект</h3>
            <form onSubmit={handleUpdateProject}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Название проекта</label>
                <input
                  type="text"
                  value={editProjectTitle}
                  onChange={(e) => setEditProjectTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsProjectEditModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-md transition-colors">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ПОЛНАЯ МОДАЛКА РЕДАКТИРОВАНИЯ ЗАДАЧИ --- */}
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
                        <label className="block text-sm text-gray-700 mb-1">Связанные задачи (зависят от текущей)</label>
                        <Select
                          isMulti
                          options={taskSelectOptions.filter(opt => opt.value !== editingTask.id)}
                          value={taskSelectOptions.filter(opt => (editFormData.linked_tasks || []).includes(opt.value))}
                          onChange={(selected) => setEditFormData({...editFormData, linked_tasks: selected ? selected.map(s => s.value) : []})}
                          placeholder="Добавить связь..."
                          menuPosition="fixed"
                          menuPortalTarget={document.body}
                          styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-sm text-gray-700 mb-1">Критичность</label>
                        <select value={editFormData.priority} onChange={(e) => setEditFormData({...editFormData, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                          <option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="text-xs text-gray-500">Начало *</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border p-2 rounded" required /></div>
                      <div><label className="text-xs text-gray-500">Дедлайн *</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border p-2 rounded" required /></div>
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
          onClick={(e) => { if (e.target === e.currentTarget) { setIsTaskModalOpen(false); setNewTaskParent(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">{newTaskParent ? 'Новая подзадача' : 'Новая задача'}</h3>
            <form onSubmit={handleCreateTask} className="space-y-4 sm:space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 break-words" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label>
                  <Select options={userOptions} value={userOptions.find(o => o.value == newTaskAssignee) || null} onChange={(opt) => setNewTaskAssignee(opt ? opt.value : null)} placeholder="Выбрать..." menuPosition="fixed" menuPortalTarget={document.body} styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Связанные задачи (зависят от текущей)</label>
                  <Select
                    isMulti
                    options={taskSelectOptions}
                    value={taskSelectOptions.filter(o => newTaskLinkedTasks.includes(o.value))}
                    onChange={(selected) => setNewTaskLinkedTasks(selected ? selected.map(s => s.value) : [])}
                    placeholder="Выберите задачи..."
                    menuPosition="fixed"
                    menuPortalTarget={document.body}
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Критичность</label>
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white">
                    <option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option>
                  </select>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Дата начала (План) *</label>
                  <input type="date" value={newTaskPlanStart} onChange={(e) => setNewTaskPlanStart(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none" required />
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
                <button type="button" onClick={() => { setIsTaskModalOpen(false); setNewTaskParent(''); }} className="w-full sm:w-auto px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="w-full sm:w-auto px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-md transition-colors">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetail;