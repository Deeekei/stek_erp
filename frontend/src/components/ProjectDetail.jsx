import { useState, useEffect, useRef, useMemo } from 'react';
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

  const isResizingColumn = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const currentDragWidth = useRef(0);

  const [listWidth, setListWidth] = useState(window.innerWidth < 768 ? 180 : 380);
  const [visualWidth, setVisualWidth] = useState(null);

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [filterTaskName, setFilterTaskName] = useState('');
  const [filterAssignee, setFilterAssignee] = useState(null);
  const [hideCompleted, setHideCompleted] = useState(false);

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

  // Стандартная модалка создания
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('new');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskPlanStart, setNewTaskPlanStart] = useState('');
  const [newTaskPlanEnd, setNewTaskPlanEnd] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(null);
  const [newTaskExecutor, setNewTaskExecutor] = useState(null); // <-- Исполнитель
  const [newTaskParticipants, setNewTaskParticipants] = useState([]);
  const [newTaskParent, setNewTaskParent] = useState('');
  const [newTaskLinkedTasks, setNewTaskLinkedTasks] = useState([]);
  const [newTaskFiles, setNewTaskFiles] = useState([]);
  const [newTaskIsMilestone, setNewTaskIsMilestone] = useState(false);

  // Модалка просмотра и редактирования
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newCommentText, setNewCommentText] = useState('');

  // === СТЕЙТЫ ДЛЯ МОДАЛКИ ДУБЛИРОВАНИЯ ===
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [allProjectsList, setAllProjectsList] = useState([]);
  const [dupTaskTitle, setDupTaskTitle] = useState('');
  const [dupTaskDescription, setDupTaskDescription] = useState('');
  const [dupTaskStatus, setDupTaskStatus] = useState('new');
  const [dupTaskPriority, setDupTaskPriority] = useState('medium');
  const [dupTaskPlanStart, setDupTaskPlanStart] = useState('');
  const [dupTaskPlanEnd, setDupTaskPlanEnd] = useState('');
  const [dupTaskAssignee, setDupTaskAssignee] = useState(null);
  const [dupTaskExecutor, setDupTaskExecutor] = useState(null); // <-- Исполнитель для копии
  const [dupTaskParticipants, setDupTaskParticipants] = useState([]);
  const [dupTaskProject, setDupTaskProject] = useState(null);
  const [dupTaskFiles, setDupTaskFiles] = useState([]);
  const [dupTaskIsMilestone, setDupTaskIsMilestone] = useState(false);

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState(null);
  const [completionDelayReason, setCompletionDelayReason] = useState('');

  const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchProjectAndUsers();
    fetchTasks();
  }, [id]);

  const fetchProjectAndUsers = async () => {
    try {
      const [projectRes, usersRes] = await Promise.all([
        api.get(`projects/${id}/`),
        api.get(`users/`).catch(() => ({ data: [] }))
      ]);

      setProject(projectRes.data);

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
        } catch (e) { console.error("Auth error:", e); }
      }
      setLoadingProject(false);
    } catch (error) { setLoadingProject(false); }
  };

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const tasksRes = await api.get(`tasks/?project=${id}&no_page=true`);
      const tasksData = tasksRes.data.results || tasksRes.data;

      const sortedTasks = [...tasksData].sort((a, b) => {
        const dateA = a.plan_start_date || a.plan_end_date;
        const dateB = b.plan_start_date || b.plan_end_date;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA) - new Date(dateB);
      });

      setTasks(sortedTasks);
      setLoadingTasks(false);
    } catch (error) { setLoadingTasks(false); }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    if (!editProjectTitle.trim()) return alert("Название проекта не может быть пустым.");
    try {
      const response = await api.patch(`projects/${id}/`, { title: editProjectTitle });
      setProject(response.data);
      setIsProjectEditModalOpen(false);
    } catch (error) { alert("Ошибка при обновлении проекта."); }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm("⚠️ ВНИМАНИЕ! Вы уверены, что хотите удалить этот проект?")) return;
    try {
      await api.delete(`projects/${id}/`);
      navigate('/projects');
    } catch (error) { alert("Не удалось удалить проект."); }
  };

  const handleTogglePin = async () => {
    try {
      const response = await api.post(`projects/${id}/toggle_pin/`);
      setProject(prev => ({ ...prev, is_pinned: response.data.is_pinned }));
    } catch (error) {
      alert("Не удалось изменить статус закрепления проекта");
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension !== 'xml' && extension !== 'csv') return alert("Только XML или CSV.");

    const formData = new FormData(); formData.append('file', file);
    const endpoint = extension === 'xml' ? 'import_xml/' : 'import_csv/';

    try {
      setLoadingTasks(true);
      await api.post(`projects/${id}/${endpoint}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert("Структура загружена!");
      fetchTasks();
    } catch (error) {
      alert(`Ошибка при импорте`);
      setLoadingTasks(false);
    } finally { e.target.value = ''; }
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get(`projects/${id}/export_excel/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Проект_${project.title || id}_Задачи.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Не удалось выгрузить проект в Excel.");
    }
  };

  const userOptions = users.map(u => {
    const fullName = `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.trim();
    return { value: u.id, label: fullName || u.username || u.email || `Сотрудник №${u.id}` };
  });

  const taskSelectOptions = tasks.map(t => ({ value: t.id, label: `#${t.id} ${t.title}` }));

  const getParentId = (task) => typeof task.parent_task === 'object' ? task.parent_task?.id : task.parent_task;

  const orderedTasks = [];
  const addChildren = (parentId) => {
    tasks.filter(t => getParentId(t) == parentId).forEach(child => { orderedTasks.push(child); addChildren(child.id); });
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
    return { backgroundColor: isParent ? theme.prog : theme.bg, backgroundSelectedColor: isParent ? theme.progSel : theme.bgSel, progressColor: theme.prog, progressSelectedColor: theme.progSel };
  };

  const filteredTasksForBoard = useMemo(() => {
    return tasks.filter(t => {
      const query = filterTaskName.toLowerCase().trim();
      const matchName =
        t.title.toLowerCase().includes(query) ||
        t.id.toString().includes(query.replace('#', ''));

      const tAssigneeId = t.assignee && typeof t.assignee === 'object' ? t.assignee.id : t.assignee;
      const matchAssignee = filterAssignee ? tAssigneeId === filterAssignee : true;
      const matchCompleted = hideCompleted ? t.status !== 'completed' : true;
      return matchName && matchAssignee && matchCompleted;
    });
  }, [tasks, filterTaskName, filterAssignee, hideCompleted]);

  let finalOrderedTasks = orderedTasks;
  if (filterTaskName || filterAssignee || hideCompleted) {
    const matchedIds = new Set();
    tasks.forEach(t => {
      const query = filterTaskName.toLowerCase().trim();
      const matchName =
        t.title.toLowerCase().includes(query) ||
        t.id.toString().includes(query.replace('#', ''));

      const tAssigneeId = t.assignee && typeof t.assignee === 'object' ? t.assignee.id : t.assignee;
      const matchAssignee = filterAssignee ? tAssigneeId === filterAssignee : true;
      const matchCompleted = hideCompleted ? t.status !== 'completed' : true;

      if (matchName && matchAssignee && matchCompleted) {
        matchedIds.add(t.id);
        let current = t;
        while (current) {
          const pId = getParentId(current);
          if (pId) { matchedIds.add(pId); current = tasks.find(parent => parent.id == pId); }
          else { break; }
        }
      }
    });
    finalOrderedTasks = orderedTasks.filter(t => matchedIds.has(t.id));
  }

  const ganttTasks = finalOrderedTasks.filter(t => t.plan_start_date && t.plan_end_date && !isTaskHidden(t)).map(t => {
    const pId = getParentId(t);
    const depsArray = t.linked_tasks || t.dependencies || [];
    const isParent = finalOrderedTasks.some(child => getParentId(child) == t.id);

    let taskType = 'task';
    if (isParent) taskType = 'project';
    else if (t.is_milestone) taskType = 'milestone';

    return {
      start: new Date(t.plan_start_date),
      end: t.is_milestone ? new Date(t.plan_start_date) : new Date(t.plan_end_date),
      name: t.title,
      id: t.id.toString(),
      type: taskType,
      project: pId ? pId.toString() : undefined,
      hideChildren: collapsedTasks.includes(Number(t.id)),
      progress: t.status === 'completed' ? 100 : (t.status === 'in_progress' ? 50 : 0),
      dependencies: depsArray.map(d => d.toString()),
      styles: getGanttStyles(t.priority, isParent)
    };
  });

  const startResizingColumn = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    isResizingColumn.current = true; startX.current = e.pageX; startWidth.current = listWidth; currentDragWidth.current = listWidth;
    setVisualWidth(listWidth); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingColumn.current) {
        e.preventDefault();
        const newWidth = Math.max(100, startWidth.current + (e.pageX - startX.current));
        currentDragWidth.current = newWidth; setVisualWidth(newWidth); return;
      }
      if (!isDragging.current) return;
      e.preventDefault();
      if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft -= (e.pageX - lastX.current);
      if (ganttContainerRef.current) ganttContainerRef.current.scrollTop -= (e.pageY - lastY.current);
      lastX.current = e.pageX; lastY.current = e.pageY;
    };
    const handleMouseUp = () => {
      if (isResizingColumn.current) { isResizingColumn.current = false; setListWidth(currentDragWidth.current); setVisualWidth(null); }
      if (isDragging.current) {
        isDragging.current = false;
        if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = 'grab';
        if (ganttContainerRef.current) ganttContainerRef.current.style.cursor = 'grab';
      }
      document.body.style.removeProperty('cursor'); document.body.style.removeProperty('user-select');
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  const handleGanttPointerDown = (e) => {
    if (e.button !== 0) return;
    const outerContainer = ganttContainerRef.current;
    if (!outerContainer) return;
    const innerScrollContainer = outerContainer.querySelector('svg')?.parentElement;
    const className = (e.target.getAttribute('class') || '').toLowerCase();
    if (className.includes('resizer-handle') || className.includes('bar') || className.includes('progress') || className.includes('wrapper') || className.includes('handle') || className.includes('arrow') || e.target.tagName?.toLowerCase() === 'button') return;

    isDragging.current = true; lastX.current = e.pageX; lastY.current = e.pageY;
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
      if (innerScrollContainer) { e.preventDefault(); innerScrollContainer.scrollLeft += e.deltaY; }
    }
  };

  const CustomTaskListHeader = ({ headerHeight, fontFamily, fontSize, rowWidth }) => (
    <div className="flex items-center border-b border-gray-200 border-r bg-gray-100 px-4 font-bold text-gray-700 text-sm" style={{ height: headerHeight, fontFamily, fontSize, width: rowWidth }}><span>Проект</span></div>
  );

  const CustomTaskListTable = ({ rowHeight, rowWidth, fontFamily, fontSize, tasks: renderedTasks, onExpanderClick }) => (
    <div className="flex flex-col border-r border-gray-200 bg-white" style={{ fontFamily, fontSize, width: rowWidth }}>
      {renderedTasks.map((rt) => {
        let depth = 0; let current = rt;
        while (current && current.project) { depth++; current = renderedTasks.find(t => t.id === current.project); }
        const isFolder = rt.type === 'project';
        const originalTask = tasks.find(t => t.id.toString() === rt.id);
        const isOverdue = originalTask && originalTask.plan_end_date < today && originalTask.status !== 'completed';
        return (
          <div key={rt.id} className={`flex items-center border-b border-gray-100 px-2 group transition-colors ${isOverdue ? 'bg-red-50/70 hover:bg-red-100/70' : 'bg-white hover:bg-gray-50'}`} style={{ height: rowHeight }}>
            <div style={{ paddingLeft: `${depth * 15}px` }} className="flex items-center flex-1 overflow-hidden truncate">
              {isFolder ? <button onClick={() => onExpanderClick(rt)} className="mr-1 text-gray-400 hover:text-gray-800 focus:outline-none w-4 shrink-0">{rt.hideChildren ? '▶' : '▼'}</button> : <span className="w-5 shrink-0 inline-block"></span>}
              <span className="mr-1 sm:mr-2 text-base shrink-0">{isFolder ? '📁' : originalTask?.is_milestone ? '🚩' : '📄'}</span>
              <span className={`truncate cursor-pointer hover:text-blue-600 transition-colors text-xs sm:text-[13px] ${isFolder ? 'font-bold text-gray-900' : isOverdue ? 'text-red-700 font-medium' : 'font-medium text-gray-700'}`} onClick={() => originalTask && handleTaskClick(originalTask)} title={rt.name}>{rt.name}</span>
            </div>
            {isFullAccess && (
              <div className={`opacity-0 group-hover:opacity-100 flex items-center space-x-1 pl-1 sm:pl-2 shrink-0 ${isOverdue ? 'bg-red-100/40' : 'bg-gray-50'}`}>
                <button onClick={(e) => { e.stopPropagation(); setNewTaskParent(rt.id); setIsTaskModalOpen(true); }} className="text-blue-500 hover:bg-blue-100 w-5 sm:w-6 h-5 sm:h-6 rounded flex items-center justify-center font-bold" title="Вложенная задача">➕</button>
                <button onClick={(e) => { e.stopPropagation(); handleQuickDelete(rt.id); }} className="text-red-500 hover:bg-red-100 w-5 sm:w-6 h-5 sm:h-6 rounded flex items-center justify-center font-bold" title="Удалить">🗑️</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const handleGanttDateChange = async (ganttTask) => {
    if (!isFullAccess) return alert("У вас нет прав для изменения сроков.");
    const payload = { plan_start_date: ganttTask.start.toISOString().split('T')[0], plan_end_date: ganttTask.end.toISOString().split('T')[0] };
    try {
      const response = await api.patch(`tasks/${ganttTask.id}/`, payload);
      setTasks(prevTasks => prevTasks.map(t => t.id === Number(ganttTask.id) ? response.data : t));
    } catch (error) { alert("Ошибка сохранения"); fetchTasks(); }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const task = tasks.find(t => t.id === taskId);

    const isParticipant = (task.participants || []).some(p => (typeof p === 'object' ? p.id : p) == currentUser?.id);

    if (isParticipant) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      try {
        await api.patch(`tasks/${taskId}/`, { status: newStatus, personal_only: true });
      } catch (error) {
        alert("Не удалось обновить личный статус");
        fetchTasks();
      }
      return;
    }

    const isRoleManager = currentUser?.role === 'manager';
    const isBoss = isFullAccess ||
      project?.owner === currentUser?.id ||
      project?.manager === currentUser?.id ||
      (project?.visibility === 'selected' && project?.allowed_users?.includes(currentUser?.id)) ||
      (project?.visibility === 'all' && isRoleManager);

    // Добавляем проверку прав для Исполнителя (executor) и Ответственного (assignee)
    const isWorker =
      (task.assignee && typeof task.assignee === 'object' ? task.assignee.id == currentUser?.id : task.assignee == currentUser?.id) ||
      (task.executor && typeof task.executor === 'object' ? task.executor.id == currentUser?.id : task.executor == currentUser?.id);

    if (!isBoss && !isWorker) return alert("Нет прав для действия.");

    const isOverdue = task.plan_end_date && task.plan_end_date < today;
    if (newStatus === 'completed' && isOverdue) {
      setTaskToComplete(task); setCompletionDelayReason(task.delay_reason || ''); setIsCompletionModalOpen(true); return;
    }

    setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await api.patch(`tasks/${taskId}/`, { status: newStatus });
      // Примечание: Мы убрали генерацию комментария на фронтенде, так как теперь бэкенд это делает сам!
    } catch (error) { alert("Ошибка при смене статуса"); fetchTasks(); }
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
      setTaskToComplete(null); setCompletionDelayReason('');
    } catch (error) { fetchTasks(); }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskPlanStart || !newTaskPlanEnd) return alert("Необходимо указать даты.");
    if (new Date(newTaskPlanStart) > new Date(newTaskPlanEnd)) return alert("Дата начала не может быть позже дедлайна.");

    const payload = {
      title: newTaskTitle, description: newTaskDescription, status: newTaskStatus, priority: newTaskPriority,
      project: parseInt(id), plan_start_date: newTaskPlanStart, plan_end_date: newTaskPlanEnd,
      assignee: newTaskAssignee,
      executor: newTaskExecutor, // <-- Добавлен Исполнитель
      participants: newTaskParticipants,
      parent_task: newTaskParent ? parseInt(newTaskParent) : null,
      linked_tasks: newTaskLinkedTasks, dependencies: newTaskLinkedTasks,
      is_milestone: newTaskIsMilestone
    };

    try {
      const response = await api.post('tasks/', payload);
      let createdTask = response.data;
      if (newTaskFiles.length > 0) {
        const uploadedAttachments = [];
        for (const file of newTaskFiles) {
          const formData = new FormData(); formData.append('file', file);
          const attRes = await api.post(`tasks/${createdTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploadedAttachments.push(attRes.data);
        }
        createdTask.attachments = uploadedAttachments;
      }
      setTasks(prevTasks => [...prevTasks, createdTask]);
      setIsTaskModalOpen(false);
      setNewTaskTitle(''); setNewTaskDescription(''); setNewTaskPlanStart(''); setNewTaskPlanEnd('');
      setNewTaskAssignee(null); setNewTaskExecutor(null); setNewTaskParticipants([]); setNewTaskParent(''); setNewTaskLinkedTasks([]); setNewTaskFiles([]); setNewTaskIsMilestone(false);
    } catch (error) { alert(`Ошибка: ${JSON.stringify(error.response?.data)}`); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    const executorId = task.executor && typeof task.executor === 'object' ? task.executor.id : task.executor;

    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '',
      assignee: assigneeId || null,
      executor: executorId || null, // <-- Добавлен Исполнитель
      participants: task.participants || [], priority: task.priority || 'medium',
      law_type: task.law_type || 'other',
      linked_tasks: task.linked_tasks || task.dependencies || [],
      is_milestone: task.is_milestone || false
    });
    setNewCommentText('');
    setIsEditMode(false);
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    if (canEditAll) {
      if (!editFormData.plan_start_date || !editFormData.plan_end_date) return alert("Укажите даты.");
      if (new Date(editFormData.plan_start_date) > new Date(editFormData.plan_end_date)) return alert("Неверные даты.");
    }

    const isOverdue = editingTask.plan_end_date && editingTask.plan_end_date < today;
    if (editFormData.status === 'completed' && isOverdue && editingTask.status !== 'completed') {
      setTaskToComplete(editingTask); setCompletionDelayReason(editingTask.delay_reason || ''); setIsCompletionModalOpen(true); setIsEditModalOpen(false); return;
    }
    try {
      const payloadToUpdate = { ...editFormData, dependencies: editFormData.linked_tasks };
      const response = await api.patch(`tasks/${editingTask.id}/`, payloadToUpdate);
      let updatedTask = response.data;

      // Примечание: Генерация авто-комментариев теперь происходит на бэкенде.

      setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
      setIsEditModalOpen(false); setEditingTask(null);
    } catch (error) { alert("Ошибка сохранения"); }
  };

  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;
    setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
    setIsEditModalOpen(false);
    try { await api.delete(`tasks/${taskId}/`); } catch (error) { fetchTasks(); }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedTask = { ...editingTask, comments: [...(editingTask.comments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t)); setNewCommentText('');
    } catch (error) { alert("Ошибка."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await api.post(`tasks/${editingTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updatedTask = { ...editingTask, attachments: [...(editingTask.attachments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка загрузки"); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      const updatedTask = { ...editingTask, attachments: editingTask.attachments.filter(att => att.id !== attachmentId) };
      setEditingTask(updatedTask); setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? updatedTask : t));
    } catch (error) { alert("Ошибка удаления."); }
  };

  const handleOpenDuplicateModal = async () => {
    if (!editingTask) return;

    const assigneeId = editingTask.assignee && typeof editingTask.assignee === 'object' ? editingTask.assignee.id : editingTask.assignee;
    const executorId = editingTask.executor && typeof editingTask.executor === 'object' ? editingTask.executor.id : editingTask.executor;

    setDupTaskTitle(`${editingTask.title} (Копия)`);
    setDupTaskDescription(editingTask.description || '');
    setDupTaskStatus('new');
    setDupTaskPriority(editingTask.priority || 'medium');
    setDupTaskPlanStart(editingTask.plan_start_date || '');
    setDupTaskPlanEnd(editingTask.plan_end_date || '');
    setDupTaskAssignee(assigneeId || null);
    setDupTaskExecutor(executorId || null); // <-- Исполнитель
    setDupTaskParticipants(editingTask.participants || []);
    setDupTaskProject(editingTask.project || parseInt(id));
    setDupTaskIsMilestone(editingTask.is_milestone || false);
    setDupTaskFiles([]);

    if (allProjectsList.length === 0) {
      try {
        const resP = await api.get('projects/');
        setAllProjectsList(resP.data.results || resP.data);
      } catch (e) { console.error("Ошибка загрузки проектов:", e); }
    }

    setIsEditModalOpen(false);
    setIsDuplicateModalOpen(true);
  };

  const handleDuplicateTaskSubmit = async (e) => {
    e.preventDefault();
    if (!dupTaskProject) return alert("Пожалуйста, выберите проект для копии задачи!");

    const payload = {
      title: dupTaskTitle,
      description: dupTaskDescription,
      status: dupTaskStatus,
      priority: dupTaskPriority,
      project: parseInt(dupTaskProject),
      assignee: dupTaskAssignee,
      executor: dupTaskExecutor, // <-- Добавлен исполнитель
      participants: dupTaskParticipants,
      is_milestone: dupTaskIsMilestone
    };
    if (dupTaskPlanStart) payload.plan_start_date = dupTaskPlanStart;
    if (dupTaskPlanEnd) payload.plan_end_date = dupTaskPlanEnd;

    try {
      const response = await api.post('tasks/', payload);
      let createdTask = response.data;

      if (dupTaskFiles.length > 0) {
        for (const file of dupTaskFiles) {
          const formData = new FormData(); formData.append('file', file);
          await api.post(`tasks/${createdTask.id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      if (parseInt(dupTaskProject) === parseInt(id)) {
        fetchTasks();
      }

      setIsDuplicateModalOpen(false);
      alert("Копия задачи успешно создана!");
    } catch (error) {
      alert("Ошибка при создании копии задачи. Проверьте правильность заполнения полей.");
    }
  };

  const isRoleManager = currentUser?.role === 'manager';

  const isBossAll = isFullAccess ||
    project?.owner === currentUser?.id ||
    project?.manager === currentUser?.id ||
    (project?.visibility === 'selected' && project?.allowed_users?.includes(currentUser?.id)) ||
    (project?.visibility === 'all' && isRoleManager);

  const isWorkerTask =
    (editingTask?.assignee && (editingTask.assignee.id == currentUser?.id || editingTask.assignee == currentUser?.id)) ||
    (editingTask?.executor && (editingTask.executor.id == currentUser?.id || editingTask.executor == currentUser?.id));

  const isParticipantTask = (editingTask?.participants || []).includes(currentUser?.id);

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

  const allProjectOptions = useMemo(() => {
    const list = allProjectsList.length > 0 ? allProjectsList : (project ? [project] : []);
    return list.map(p => ({ value: p.id, label: p.title }));
  }, [allProjectsList, project]);

  const kanbanColumns = [
    { id: 'new', title: 'Новые', color: 'border-gray-200 bg-gray-50' },
    { id: 'in_progress', title: 'В работе', color: 'border-blue-200 bg-blue-50' },
    { id: 'delayed', title: 'В отсрочке', color: 'border-orange-200 bg-orange-50' },
    { id: 'completed', title: 'Завершены', color: 'border-green-200 bg-green-50' }
  ];

  if (loadingProject) return <div className="p-4 sm:p-12 text-center text-gray-500 font-medium">Загрузка интерфейса...</div>;
  if (!project) return <div className="p-4 sm:p-12 text-center text-red-500">Проект не найден.</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-500 mb-1"><Link to="/projects" className="hover:text-blue-600">Проекты</Link> <span className="mx-2">/</span> {project.title}</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 break-words flex items-center gap-2">
            {project.title}
            <button
              onClick={handleTogglePin}
              className="text-xl p-1 rounded-lg hover:bg-gray-100 transition-all active:scale-95"
              title={project.is_pinned ? "Открепить проект" : "Закрепить проект"}
            >
              <span className={project.is_pinned ? "opacity-100 drop-shadow-md" : "opacity-25 hover:opacity-60 transition-opacity"}>
                📌
              </span>
            </button>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <input type="file" accept=".xml,.csv" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          {isFullAccess && (
            <>
              <button onClick={() => fileInputRef.current.click()} className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg text-sm shadow-sm whitespace-nowrap">📥 Импорт</button>
              <button onClick={handleExportExcel} className="flex-1 sm:flex-none px-4 py-2 border border-green-300 bg-green-50 hover:bg-green-100 text-green-600 font-semibold rounded-lg text-sm shadow-sm whitespace-nowrap">📊 Экспорт Excel</button>
              <button onClick={() => { setEditProjectTitle(project.title); setIsProjectEditModalOpen(true); }} className="flex-1 sm:flex-none px-4 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold rounded-lg text-sm shadow-sm whitespace-nowrap">✏️ Изменить</button>
              <button onClick={handleDeleteProject} className="flex-1 sm:flex-none px-4 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-sm shadow-sm whitespace-nowrap">🗑️ Удалить</button>
            </>
          )}
          <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto justify-center">
            <button onClick={() => setCurrentView('gantt')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentView === 'gantt' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Гант</button>
            <button onClick={() => setCurrentView('board')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currentView === 'board' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>Канбан</button>
          </div>
          {isBossAll && <button onClick={() => { setNewTaskParent(''); setIsTaskModalOpen(true); }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-md whitespace-nowrap">+ Задача</button>}
        </div>
      </div>

      <div className="mb-4 flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto flex-1">
          <input
            type="text"
            placeholder="🔍 Поиск по названию или номеру..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full sm:w-64 outline-none focus:ring-2 focus:ring-blue-500"
            value={filterTaskName}
            onChange={(e) => setFilterTaskName(e.target.value)}
          />
          <div className="w-full sm:w-64">
            <Select
              options={userOptions}
              value={userOptions.find(o => o.value === filterAssignee) || null}
              onChange={(opt) => setFilterAssignee(opt ? opt.value : null)}
              placeholder="👤 Ответственный..."
              isClearable
              styles={{
                control: (base) => ({ ...base, minHeight: '34px', height: '34px', borderRadius: '0.5rem' }),
                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                menuPortal: base => ({ ...base, zIndex: 9999 })
              }}
              menuPortalTarget={document.body}
            />
          </div>
          <label className="flex items-center text-sm font-bold text-gray-600 cursor-pointer select-none sm:ml-2 shrink-0 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors w-full sm:w-auto justify-center sm:justify-start">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="mr-2 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
            />
            👁️ Скрыть завершенные
          </label>
        </div>
        {currentView === 'gantt' && (
          <div className="flex gap-1 shrink-0 w-full sm:w-auto justify-end">
            <button onClick={() => setGanttZoom(ViewMode.Day)} className={`px-3 py-1 text-xs sm:text-sm rounded ${ganttZoom === ViewMode.Day ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Дни</button>
            <button onClick={() => setGanttZoom(ViewMode.Week)} className={`px-3 py-1 text-xs sm:text-sm rounded ${ganttZoom === ViewMode.Week ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Недели</button>
            <button onClick={() => setGanttZoom(ViewMode.Month)} className={`px-3 py-1 text-xs sm:text-sm rounded ${ganttZoom === ViewMode.Month ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'}`}>Месяцы</button>
          </div>
        )}
      </div>

      {currentView === 'board' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1 items-start">
            {kanbanColumns.map(column => {
              const columnTasks = filteredTasksForBoard.filter(task => task.status === column.id);
              return (
                <div key={column.id} className={`flex flex-col flex-shrink-0 w-72 sm:w-80 rounded-xl border ${column.color} max-h-full`}>
                  <div className="p-3 sm:p-4 font-bold text-gray-700 flex justify-between items-center border-b border-black/5">
                    {column.title} <span className="bg-white/60 px-2 py-0.5 rounded text-sm text-gray-500">{columnTasks.length}</span>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="p-2 sm:p-3 flex-1 overflow-y-auto min-h-[200px]">
                        {columnTasks.map((task, index) => {
                          const isOverdue = task.plan_end_date < today && task.status !== 'completed' && task.status !== 'delayed';
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
                                  <h4 className="font-semibold text-gray-800 text-sm mb-1 break-words">
                                    {task.is_milestone && <span className="mr-1" title="Веха">🚩</span>}
                                    {task.title}
                                  </h4>
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
          <div className="flex-1 relative overflow-hidden flex flex-col rounded-md border border-gray-100">
            <div className="flex-1 overflow-auto relative select-none" ref={ganttContainerRef} onPointerDownCapture={handleGanttPointerDown} onWheelCapture={handleGanttWheel}>
              {ganttTasks.length > 0 ? (
                <Gantt
                  tasks={ganttTasks}
                  viewMode={ganttZoom}
                  onDateChange={handleGanttDateChange}
                  onExpanderClick={handleExpanderClick}
                  TaskListHeader={CustomTaskListHeader}
                  TaskListTable={CustomTaskListTable}
                  listCellWidth={listWidth}
                  locale="ru"
                />
              ) : <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium">Задачи не найдены (или у них не указаны даты).</div>}
            </div>

            {ganttTasks.length > 0 && (
              <>
                <div
                  onMouseDown={startResizingColumn}
                  className="resizer-handle absolute top-0 bottom-0 z-20 w-4 cursor-col-resize flex justify-center group"
                  style={{ left: listWidth - 2 }}
                >
                  <div className="resizer-handle w-[2px] h-full bg-transparent group-hover:bg-blue-400 transition-colors" />
                </div>

                {visualWidth !== null && (
                  <div
                    className="absolute top-0 bottom-0 z-30 border-l-2 border-dashed border-blue-500 pointer-events-none"
                    style={{ left: visualWidth }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Модалка изменения проекта */}
      {isProjectEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsProjectEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Изменить проект</h3>
            <form onSubmit={handleUpdateProject}>
              <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Название</label><input type="text" value={editProjectTitle} onChange={(e) => setEditProjectTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsProjectEditModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Отмена</button><button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Сохранить</button></div>
            </form>
          </div>
        </div>
      )}

      {/* === МОДАЛКА ПРОСМОТРА И РЕДАКТИРОВАНИЯ ЗАДАЧИ === */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 lg:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

              {/* РЕЖИМ ПОЛНОГО РЕДАКТИРОВАНИЯ */}
              {canEditAll && isEditMode ? (
                <>
                  <div className="w-full md:w-2/3 p-6 md:p-8 overflow-y-auto border-r border-gray-200 bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">#{editingTask.id}</span>
                        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded uppercase tracking-wide">📁 Проект: {project?.title}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button onClick={handleOpenDuplicateModal} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1">📑 Дублировать</button>
                        <button onClick={() => handleQuickDelete(editingTask.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap">Удалить</button>
                      </div>
                    </div>

                    <form id="editForm" onSubmit={handleUpdateTask} className="space-y-4">
                      <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} className="w-full text-xl sm:text-2xl font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none pb-1 mb-2" placeholder="Название задачи" required />

                      <div className="flex items-center mb-4">
                        <input
                          type="checkbox"
                          id="pd_is_milestone_edit"
                          checked={editFormData.is_milestone || false}
                          onChange={(e) => setEditFormData({...editFormData, is_milestone: e.target.checked})}
                          className="mr-2 cursor-pointer w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <label htmlFor="pd_is_milestone_edit" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                          🚩 Отметить как веху
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.assignee?.id ?? editFormData.assignee)) || null} onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Исполнитель</label><Select options={userOptions} value={userOptions.find(o => o.value == (editFormData.executor?.id ?? editFormData.executor)) || null} onChange={(opt) => setEditFormData({...editFormData, executor: opt ? opt.value : null})} placeholder="Выбрать..." isSearchable menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                        <div className="sm:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => (editFormData.participants || []).includes(o.value))} onChange={(selected) => setEditFormData({...editFormData, participants: selected ? selected.map(s => s.value) : []})} placeholder="Добавить..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                        <div className="sm:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Связанные задачи</label><Select isMulti options={taskSelectOptions.filter(opt => opt.value !== editingTask.id)} value={taskSelectOptions.filter(opt => (editFormData.linked_tasks || []).includes(opt.value))} onChange={(selected) => setEditFormData({...editFormData, linked_tasks: selected ? selected.map(s => s.value) : []})} placeholder="Добавить связь..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Статус</label>
                          <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                            <option value="new">Новая</option>
                            <option value="in_progress">В работе</option>
                            <option value="delayed">⏸️ В отсрочке</option>
                            <option value="completed">Завершена</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Тип правового отдела</label>
                          <select value={editFormData.law_type} onChange={(e) => setEditFormData({...editFormData, law_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                            <option value="other">⚪ Другое</option>
                            <option value="shareholders">👥 Дольщики</option>
                            <option value="claims">📄 Претензии</option>
                            <option value="courts">⚖️ Суды</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
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
                          <div key={att.id} className="relative text-xs bg-white border border-gray-200 p-2.5 rounded-xl flex flex-col shadow-sm min-w-[150px] max-w-xs group hover:border-blue-300 transition-all">
                            {canInteract && (
                              <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10" title="Удалить">✕</button>
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

                  <div className="w-full md:w-1/3 flex flex-col bg-slate-50 p-6 md:p-8">
                    <h4 className="text-lg font-extrabold text-gray-800 mb-4 flex-shrink-0 flex items-center gap-2">💬 Чат</h4>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
                      {[...(editingTask.comments || [])]
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .map(c => {
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
                      <div className="flex-shrink-0 bg-white p-2 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                        <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-2">
                          <button onClick={handleAddComment} className="bg-blue-600 text-white px-5 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 w-full sm:w-auto">Отправить</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (

                /* РЕЖИМ ПРОСМОТРА (ДЛЯ ВСЕХ) */
                <>
                  <div className="w-full md:w-2/3 flex flex-col bg-slate-50 border-r border-gray-200 p-6 md:p-8 order-2 md:order-1">
                    <div className="flex justify-between items-start mb-4 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-1 bg-white border border-gray-200 text-gray-500 rounded">#{editingTask.id}</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide ${isWorkerTask ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {isWorkerTask ? '👷‍♂️ Исполнитель' : '👀 Участник'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <button onClick={handleOpenDuplicateModal} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1">📑 Дублировать</button>

                        {canEditAll && (
                          <button onClick={() => setIsEditMode(true)} className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-bold transition-colors border border-gray-200 shadow-sm flex items-center gap-1.5">
                            <span>✏️</span> Редактировать
                          </button>
                        )}
                      </div>
                    </div>

                    <h2 className="text-2xl font-extrabold text-gray-900 mb-6 flex-shrink-0 leading-tight break-words">
                      {editingTask.is_milestone && <span className="mr-2" title="Веха">🚩</span>}
                      {editingTask.title}
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
                      {[...(editingTask.comments || [])]
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .map(c => {
                        const isMe = currentUser && c.author_name && (
                          (currentUser.first_name && c.author_name.includes(currentUser.first_name)) ||
                          (currentUser.username && c.author_name.includes(currentUser.username))
                        );
                        return (
                          <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
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
                      {(!editingTask.comments || editingTask.comments.length === 0) && <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-70"><span className="text-5xl mb-3">📭</span><p className="text-sm font-medium">Здесь пока тихо. Напишите первым!</p></div>}
                    </div>

                    {canInteract && (
                      <div className="flex-shrink-0 bg-white p-3 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать сообщение участникам..." className="w-full text-sm outline-none resize-none min-h-[60px] break-words bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                        <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-3">
                          <span className="text-xs text-gray-400 hidden sm:inline font-medium">Ctrl + Enter для отправки</span>
                          <button onClick={handleAddComment} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm w-full sm:w-auto">Отправить</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full md:w-1/3 p-6 md:p-8 overflow-y-auto bg-white flex flex-col order-1 md:order-2">
                    <div className={`mb-6 p-4 rounded-xl border ${isWorkerTask ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Статус задачи</label>
                      {isWorkerTask ? (
                        <form id="editForm" onSubmit={handleUpdateTask}>
                          <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-2 border border-blue-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 font-semibold cursor-pointer">
                            <option value="new">🆕 Новая</option>
                            <option value="in_progress">⚙️ В работе</option>
                            <option value="delayed">⏸️ В отсрочке</option>
                            <option value="completed">✅ Завершена</option>
                          </select>
                        </form>
                      ) : (
                        <div className="text-sm font-semibold text-gray-800">
                          {editingTask.status === 'new' ? '🆕 Новая' : editingTask.status === 'in_progress' ? '⚙️ В работе' : editingTask.status === 'delayed' ? '⏸️ В отсрочке' : '✅ Завершена'}
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

                      {/* ТИП ПРАВОВОГО ОТДЕЛА */}
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                        <span className="block text-[10px] text-purple-500 font-bold uppercase tracking-wider mb-1">Тип правового отдела</span>
                        <span className="text-sm font-semibold text-purple-900">
                          {editingTask.law_type === 'shareholders' && '👥 Дольщики'}
                          {editingTask.law_type === 'claims' && '📄 Претензии'}
                          {editingTask.law_type === 'courts' && '⚖️ Суды'}
                          {(editingTask.law_type === 'other' || !editingTask.law_type) && '⚪ Другое'}
                        </span>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100"><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Сроки</span><span className="text-sm font-semibold text-gray-800">{editingTask.plan_start_date || '—'} → <span className={new Date(editingTask.plan_end_date) < new Date(today) && editingTask.status !== 'completed' ? 'text-red-500' : ''}>{editingTask.plan_end_date || '—'}</span></span></div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100"><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Критичность</span><span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${getPriorityInfo(editingTask.priority).color}`}>{getPriorityInfo(editingTask.priority).icon} {getPriorityInfo(editingTask.priority).label}</span></div>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100"><span className="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">Проект</span><span className="text-sm font-semibold text-blue-900 truncate block"><Link to={`/projects/${editingTask.project}`} className="hover:underline">📁 {project?.title || editingTask.project}</Link></span></div>
                    </div>

                    <div className="mb-6 flex-1">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Описание</span>
                      <div className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{editingTask.description || <span className="italic text-gray-400">Описание отсутствует.</span>}</div>
                    </div>

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
                  {isWorkerTask && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить статус</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === МОДАЛКА СОЗДАНИЯ КОПИИ ЗАДАЧИ === */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsDuplicateModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">Создание копии задачи</h3>
            <form onSubmit={handleDuplicateTaskSubmit} className="space-y-4 sm:space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input type="text" value={dupTaskTitle} onChange={(e) => setDupTaskTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 break-words font-bold" required />
                </div>

                <div className="sm:col-span-2 flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="dup_is_milestone"
                    checked={dupTaskIsMilestone}
                    onChange={(e) => setDupTaskIsMilestone(e.target.checked)}
                    className="mr-2 cursor-pointer w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="dup_is_milestone" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                    🚩 Отметить как веху
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Проект *</label>
                  <Select
                    options={allProjectOptions}
                    value={allProjectOptions.find(o => o.value == dupTaskProject) || null}
                    onChange={(opt) => setDupTaskProject(opt ? opt.value : null)}
                    placeholder="Выбрать проект..."
                    isSearchable
                    menuPosition="fixed"
                    styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    noOptionsMessage={() => "Нет доступных проектов"}
                  />
                </div>

                <div><label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == dupTaskAssignee) || null} onChange={(opt) => setDupTaskAssignee(opt ? opt.value : null)} placeholder="Выбрать..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label><Select options={userOptions} value={userOptions.find(o => o.value == dupTaskExecutor) || null} onChange={(opt) => setDupTaskExecutor(opt ? opt.value : null)} placeholder="Выбрать..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => dupTaskParticipants.includes(o.value))} onChange={(selected) => setDupTaskParticipants(selected ? selected.map(s => s.value) : [])} placeholder="Добавить..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Критичность</label><select value={dupTaskPriority} onChange={(e) => setDupTaskPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white"><option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option></select></div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дата начала (План)</label><input type="date" value={dupTaskPlanStart} onChange={(e) => setDupTaskPlanStart(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн *</label><input type="date" value={dupTaskPlanEnd} onChange={(e) => setDupTaskPlanEnd(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" required /></div>
              </div>
              <div className="border border-dashed border-gray-300 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <label className="block text-sm font-bold text-gray-700 mb-2">📎 Прикрепить новые файлы</label><input type="file" multiple onChange={(e) => setDupTaskFiles(Array.from(e.target.files))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" />
                {dupTaskFiles.length > 0 && (<div className="mt-3 flex flex-wrap gap-2">{dupTaskFiles.map((f, idx) => (<span key={idx} className="bg-white border border-gray-200 text-xs text-gray-600 px-2.5 py-1 rounded shadow-sm">📄 {f.name}</span>))}</div>)}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Описание</label><textarea value={dupTaskDescription} onChange={(e) => setDupTaskDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg min-h-[80px] break-words"></textarea></div>
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-50"><button type="button" onClick={() => setIsDuplicateModalOpen(false)} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button><button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-colors font-bold">Создать копию</button></div>
            </form>
          </div>
        </div>
      )}

      {/* === МОДАЛКА ПРОСРОЧКИ ЗАДАЧИ === */}
      {isCompletionModalOpen && taskToComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsCompletionModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 w-full max-w-md border-t-8 border-red-500">
            <h3 className="text-xl font-bold text-gray-800 mb-4 break-words">Задача просрочена</h3>
            <form onSubmit={handleConfirmCompletion}>
              <textarea
                value={completionDelayReason}
                onChange={(e) => setCompletionDelayReason(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] mb-6 text-sm break-words"
                placeholder="Укажите причину просрочки..."
                required
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsCompletionModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Отмена</button>
                <button type="submit" className="px-5 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg">Завершить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА СОЗДАНИЯ ЗАДАЧИ --- */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) { setIsTaskModalOpen(false); setNewTaskParent(''); setNewTaskFiles([]); setNewTaskParticipants([]); setNewTaskIsMilestone(false); } }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 break-words">{newTaskParent ? 'Новая подзадача' : 'Новая задача'}</h3>
            <form onSubmit={handleCreateTask} className="space-y-4 sm:space-y-6">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                  <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 break-words" required />
                </div>

                <div className="sm:col-span-2 flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="pd_is_milestone_new"
                    checked={newTaskIsMilestone}
                    onChange={(e) => setNewTaskIsMilestone(e.target.checked)}
                    className="mr-2 cursor-pointer w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="pd_is_milestone_new" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                    🚩 Отметить как веху
                  </label>
                </div>

                <div><label className="block text-sm font-medium text-gray-700 mb-1">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == newTaskAssignee) || null} onChange={(opt) => setNewTaskAssignee(opt ? opt.value : null)} placeholder="Выбрать..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label><Select options={userOptions} value={userOptions.find(o => o.value == newTaskExecutor) || null} onChange={(opt) => setNewTaskExecutor(opt ? opt.value : null)} placeholder="Выбрать..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => newTaskParticipants.includes(o.value))} onChange={(selected) => setNewTaskParticipants(selected ? selected.map(s => s.value) : [])} placeholder="Добавить..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Связанные задачи</label><Select isMulti options={taskSelectOptions} value={taskSelectOptions.filter(o => newTaskLinkedTasks.includes(o.value))} onChange={(selected) => setNewTaskLinkedTasks(selected ? selected.map(s => s.value) : [])} placeholder="Выберите задачи..." menuPosition="fixed" styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Критичность</label><select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white"><option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option></select></div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дата начала (План) *</label><input type="date" value={newTaskPlanStart} onChange={(e) => setNewTaskPlanStart(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" required /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн *</label><input type="date" value={newTaskPlanEnd} onChange={(e) => setNewTaskPlanEnd(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" required /></div>
              </div>
              <div className="border border-dashed border-gray-300 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <label className="block text-sm font-bold text-gray-700 mb-2">📎 Прикрепить файлы</label><input type="file" multiple onChange={(e) => setNewTaskFiles(Array.from(e.target.files))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" />
                {newTaskFiles.length > 0 && (<div className="mt-3 flex flex-wrap gap-2">{newTaskFiles.map((f, idx) => (<span key={idx} className="bg-white border border-gray-200 text-xs text-gray-600 px-2.5 py-1 rounded shadow-sm">📄 {f.name}</span>))}</div>)}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Описание</label><textarea value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg min-h-[80px] break-words"></textarea></div>
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-50"><button type="button" onClick={() => { setIsTaskModalOpen(false); setNewTaskParent(''); setNewTaskFiles([]); setNewTaskParticipants([]); setNewTaskIsMilestone(false); }} className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Отмена</button><button type="submit" className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Создать</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetail;