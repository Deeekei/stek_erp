import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import api from '../api';

function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newCommentText, setNewCommentText] = useState('');

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState(null);
  const [completionDelayReason, setCompletionDelayReason] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, projectsRes, usersRes] = await Promise.all([
        api.get('tasks/?assigned_to_me=true'),
        api.get('projects/'),
        api.get('users/').catch(() => ({ data: [] }))
      ]);

      const sortedTasks = [...(tasksRes.data.results || tasksRes.data)].sort((a, b) => {
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

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const task = tasks.find(t => t.id === taskId);
    const taskProject = projects.find(p => p.id === task.project);

    const isBoss = isFullAccess || taskProject?.owner === currentUser?.id || taskProject?.manager === currentUser?.id || (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id));
    const isWorker = task.assignee && typeof task.assignee === 'object' ? task.assignee.id == currentUser?.id : task.assignee == currentUser?.id;
    const isParticipant = (task.participants || []).includes(currentUser?.id);

    if (!isBoss && !isWorker && !isParticipant) return alert("Нет прав для действия.");

    if (isParticipant && !isWorker && !isBoss) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      try { await api.post(`tasks/${taskId}/hide/`); }
      catch (error) { fetchData(); }
      return;
    }

    const isOverdue = task.plan_end_date && task.plan_end_date < today;
    if (newStatus === 'completed' && isOverdue) {
      setTaskToComplete(task);
      setCompletionDelayReason(task.delay_reason || '');
      setIsCompletionModalOpen(true);
      return;
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try { await api.patch(`tasks/${taskId}/`, { status: newStatus }); }
    catch (error) { alert("Ошибка смены статуса."); fetchData(); }
  };

  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    if (!completionDelayReason.trim()) return alert("Укажите причину просрочки!");
    const payload = { status: 'completed', delay_reason: completionDelayReason, actual_end_date: today };
    setTasks(prev => prev.map(t => t.id === taskToComplete.id ? { ...t, ...payload } : t));
    setIsCompletionModalOpen(false);

    try {
      await api.patch(`tasks/${taskToComplete.id}/`, payload);
      setTaskToComplete(null); setCompletionDelayReason('');
      fetchData();
    } catch (error) { alert("Ошибка."); fetchData(); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '', assignee: assigneeId || null, participants: task.participants || [], priority: task.priority || 'medium'
    });
    setNewCommentText('');
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();

    const taskProject = projects.find(p => p.id === editingTask.project);
    const isBoss = isFullAccess || taskProject?.owner === currentUser?.id || taskProject?.manager === currentUser?.id || (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id));

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
      setTasks(prevTasks => prevTasks.map(t => t.id === editingTask.id ? response.data : t));
      setIsEditModalOpen(false); setEditingTask(null);
    } catch (error) { alert("Ошибка"); }
  };

  const handleQuickDelete = async (taskId) => {
    if (!window.confirm("Удалить задачу?")) return;
    try { await api.delete(`tasks/${taskId}/`); setTasks(tasks.filter(t => t.id !== taskId)); setIsEditModalOpen(false); }
    catch (error) { alert("Ошибка при удалении."); }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await api.post(`tasks/${editingTask.id}/add_comment/`, { text: newCommentText });
      const updatedTask = { ...editingTask, comments: [...(editingTask.comments || []), response.data] };
      setEditingTask(updatedTask); setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t)); setNewCommentText('');
    } catch (error) { alert("Не удалось отправить."); }
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
  const isBossAll = isFullAccess || taskProject?.owner === currentUser?.id || taskProject?.manager === currentUser?.id || (taskProject?.visibility === 'selected' && taskProject?.allowed_users?.includes(currentUser?.id));
  const isWorkerTask = editingTask?.assignee && typeof editingTask.assignee === 'object' ? editingTask.assignee.id == currentUser?.id : editingTask?.assignee == currentUser?.id;
  const isParticipantTask = (editingTask?.participants || []).includes(currentUser?.id);

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

  const kanbanColumns = [
    { id: 'new', title: 'Новые', color: 'border-gray-200 bg-gray-50' },
    { id: 'in_progress', title: 'В работе', color: 'border-blue-200 bg-blue-50' },
    { id: 'completed', title: 'Завершены', color: 'border-green-200 bg-green-50' }
  ];

  if (loading) return <div className="p-12 text-center text-gray-500">Загрузка ваших задач...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Мои задачи</h1>
        <p className="text-sm text-gray-500 mt-1">Все задачи, в которых вы назначены ответственным</p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-4 flex-1 items-start">
          {kanbanColumns.map(column => {
            const columnTasks = tasks.filter(task => {
              const taskAssigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
              return task.status === column.id && taskAssigneeId == currentUser?.id;
            });
            return (
              <div key={column.id} className={`flex flex-col flex-shrink-0 w-80 rounded-xl border ${column.color} max-h-full`}>
                <div className="p-4 font-bold text-gray-700 flex justify-between items-center border-b border-black/5">
                  {column.title} <span className="bg-white/60 px-2 py-0.5 rounded text-sm text-gray-500">{columnTasks.length}</span>
                </div>
                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="p-3 flex-1 overflow-y-auto min-h-[200px]">
                      {columnTasks.map((task, index) => {
                        const isOverdue = task.plan_end_date < today && task.status !== 'completed';
                        const prioInfo = getPriorityInfo(task.priority);
                        return (
                          <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => handleTaskClick(task)} className={`bg-white p-4 mb-3 rounded-lg shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-100'} cursor-pointer hover:shadow-md transition-all`}>
                                <div className="flex justify-between items-start mb-2">
                                  <span className={`px-2 py-0.5 text-[10px] uppercase rounded font-medium ${prioInfo.color}`}>{prioInfo.icon} {prioInfo.label}</span>
                                  <span className="text-gray-400 text-xs font-medium">#{task.id}</span>
                                </div>
                                <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug break-words">{task.title}</h4>
                                <div className="text-[11px] text-blue-600 font-medium mb-2 truncate">
                                  <Link to={`/projects/${task.project}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>📁 {task.project_title || `Проект #${task.project}`}</Link>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500 font-medium mt-3 border-t pt-2 border-gray-50">
                                  <div className={isOverdue ? 'text-red-500 font-bold' : ''}>⏳ {task.plan_end_date || 'Нет срока'}</div>
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

      {/* === ЕДИНАЯ МОДАЛКА РЕДАКТИРОВАНИЯ ЗАДАЧИ === */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 lg:p-8" onClick={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">

            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

              {canEditAll ? (
                // --- ВЬЮШКА ДЛЯ БОССА ---
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
                            <div key={att.id} className="relative text-xs bg-white border border-gray-200 px-3 py-2 rounded-lg flex flex-col shadow-sm min-w-[120px] max-w-xs group hover:border-blue-300 transition-colors">
                              {canInteract && <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10" title="Удалить">✕</button>}
                              <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 mb-1 hover:text-blue-600 truncate break-words"><span className="mr-2 text-base">📄</span> <span className="truncate">{att.file ? att.file.split('/').pop() : `Файл ${att.id}`}</span></a>
                            </div>
                          )) : <span className="text-xs text-gray-400 italic">Файлов нет</span>}
                        </div>
                        {canInteract && <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full" />}
                      </div>
                    </div>
                  </div>

                  {/* Правая колонка (Чат) */}
                  <div className="w-full md:w-1/3 flex flex-col bg-slate-50 min-h-0">
                    <div className="p-6 pb-2 flex-shrink-0 border-b border-gray-200">
                       <h4 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">💬 Чат</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {editingTask.comments && editingTask.comments.length > 0 ? (
                        editingTask.comments.map(c => {
                          const isMe = currentUser && c.author_name.includes(currentUser.first_name);
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
                // --- ВЬЮШКА ДЛЯ ИСПОЛНИТЕЛЯ / УЧАСТНИКА ---
                <>
                  {/* Левая колонка (ЧАТ - ШИРОКАЯ 66%) */}
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
                          const isMe = currentUser && c.author_name.includes(currentUser.first_name);
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

                  {/* Правая колонка (ДЕТАЛИ И ФАЙЛЫ - УЗКАЯ 33%) */}
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
                            <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words"><span className="mr-2 text-base">📄</span> <span className="truncate">{att.file ? att.file.split('/').pop() : `Файл`}</span></a>
                          </div>
                        )) : <span className="text-xs text-gray-400 italic">Файлов нет</span>}
                      </div>
                      {canInteract && <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full" />}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Футер */}
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row justify-end gap-3 flex-shrink-0">
             <button onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto px-6 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-colors border border-gray-300">Закрыть</button>
             {canEditAll && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить изменения</button>}
             {(!canEditAll && isWorkerTask) && <button type="submit" form="editForm" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Сохранить статус</button>}
            </div>

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

export default MyTasks;