import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Select from 'react-select';
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

      setTasks(tasksRes.data);
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
            setIsFullAccess(current.role === 'admin' || current.role === 'director');
          } else {
            setCurrentUser({ id: userId, role: userRole });
            setIsFullAccess(userRole === 'admin' || userRole === 'director');
          }
        } catch (e) {
          console.error("Auth error:", e);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error("Ошибка при загрузке:", error);
      setLoading(false);
    }
  };

  const userOptions = users.map(u => {
    const firstName = u.first_name || u.firstName || '';
    const lastName = u.last_name || u.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const directName = u.full_name || u.fullName || '';
    return { value: u.id, label: fullName || directName || u.username || u.email || `Сотрудник №${u.id}` };
  });

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const task = tasks.find(t => t.id === taskId);
    const taskProject = projects.find(p => p.id === task.project);

    const isBoss = isFullAccess || currentUser?.id == taskProject?.manager;
    const taskAssigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;
    const isWorker = taskAssigneeId == currentUser?.id;

    if (!isBoss && !isWorker) {
        return alert("Только исполнитель или руководитель может менять статус этой задачи.");
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
      setTaskToComplete(null);
      setCompletionDelayReason('');
      fetchData();
    } catch (error) { alert("Ошибка."); fetchData(); }
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    const assigneeId = task.assignee && typeof task.assignee === 'object' ? task.assignee.id : task.assignee;

    setEditFormData({
      title: task.title || '', description: task.description || '', status: task.status || 'new', plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '', assignee: assigneeId || null
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
      fetchData(); setIsEditModalOpen(false); setEditingTask(null);
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
    } catch (error) {
      alert("Ошибка при удалении файла.");
    }
  };

  const isAssignee = editingTask?.assignee && typeof editingTask.assignee === 'object'
    ? editingTask.assignee.id == currentUser?.id
    : editingTask?.assignee == currentUser?.id;

  const currentProject = projects.find(p => p.id === editingTask?.project);
  const isProjectManager = currentProject?.manager == currentUser?.id;

  const hasAdminView = isFullAccess || isProjectManager;
  const canEdit = hasAdminView || isAssignee;

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'low': return 'bg-gray-100 text-gray-600'; case 'medium': return 'bg-blue-50 text-blue-600';
      case 'high': return 'bg-orange-50 text-orange-600'; case 'critical': return 'bg-red-100 text-red-700 font-bold';
      default: return 'bg-gray-100 text-gray-600';
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
                        return (
                          <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => handleTaskClick(task)} className={`bg-white p-4 mb-3 rounded-lg shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-100'} cursor-pointer hover:shadow-md transition-all`}>
                                <div className="flex justify-between items-start mb-2">
                                  <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                                  <span className="text-gray-400 text-xs font-medium">#{task.id}</span>
                                </div>
                                <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug">{task.title}</h4>
                                <div className="text-[11px] text-blue-600 font-medium mb-2 truncate">📁 {task.project_title || `Проект #${task.project}`}</div>
                                <div className="flex justify-between items-center text-xs text-gray-500 font-medium mt-3 border-t pt-2 border-gray-50">
                                  <div className={isOverdue ? 'text-red-500 font-bold' : ''}>⏳ {task.plan_end_date || 'Нет срока'}</div>
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

      {/* --- ЕДИНАЯ СИНХРОНИЗИРОВАННАЯ МОДАЛКА --- */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-8">
            {hasAdminView ? (
              // ВАРИАНТ ДЛЯ АДМИНА И РУКОВОДИТЕЛЯ ПРОЕКТА
              <>
                <div className="flex-1 space-y-6">
                  <div className="flex justify-between items-start border-b pb-4">
                    <h3 className="text-2xl font-bold text-gray-800">#{editingTask.id} {editingTask.title}</h3>
                    <button onClick={() => handleQuickDelete(editingTask.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">Удалить</button>
                  </div>
                  <form id="editForm" onSubmit={handleUpdateTask} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Ответственный</label>
                        <Select
                          options={userOptions}
                          value={userOptions.find(o => o.value == (editFormData.assignee?.id ?? editFormData.assignee)) || null}
                          onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})}
                          placeholder="Выбрать..."
                          isSearchable
                          menuPosition="fixed"
                          menuPortalTarget={document.body}
                          styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Статус</label>
                        <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-white">
                          <option value="new">Новая</option><option value="in_progress">В работе</option><option value="completed">Завершена</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs text-gray-500">Начало</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                      <div><label className="text-xs text-gray-500">Дедлайн</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border p-2 rounded" /></div>
                    </div>
                    <div><label className="block text-sm text-gray-700 mb-1">Описание</label><textarea value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full p-2 border rounded min-h-[80px]" /></div>
                  </form>
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">📎 Вложения</h4>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {editingTask.attachments && editingTask.attachments.map(att => (
                        <div key={att.id} className="relative text-xs bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors flex flex-col shadow-sm min-w-[160px] max-w-xs group">
                          {canEdit && (
                            <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white shadow-sm font-bold z-10" title="Удалить файл">✕</button>
                          )}
                          <a href={att.file} target="_blank" rel="noreferrer" className="text-xs bg-gray-100 border border-gray-200 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors flex items-center shadow-sm"><span className="mr-1">📄</span> <span className="truncate">{att.file ? att.file.split('/').pop() : `Файл ${att.id}`}</span></a>
                          {(att.uploaded_by_name || att.upload_at) && (
                            <div className="text-[10px] text-gray-500 mt-1 pt-1 border-t border-gray-200/60 flex flex-col space-y-0.5">
                              {att.uploaded_by_name && <span className="truncate">👤 {att.uploaded_by_name}</span>}
                              {att.upload_at && <span>📅 {new Date(att.upload_at).toLocaleDateString('ru-RU')}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                      {(!editingTask.attachments || editingTask.attachments.length === 0) && <span className="text-xs text-gray-400">Нет прикрепленных файлов</span>}
                    </div>
                    <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors" />
                  </div>
                </div>
                <div className="w-80 border-l pl-6 flex flex-col bg-gray-50 -my-8 -mr-8 p-8">
                  <h4 className="text-lg font-bold text-gray-800 mb-4 flex-shrink-0">💬 Обсуждение</h4>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
                    {editingTask.comments && editingTask.comments.length > 0 ? (
                      editingTask.comments.map(c => (
                        <div key={c.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-blue-600 text-xs">{c.author_name}</span>
                            <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-gray-700 whitespace-pre-wrap mt-1">{c.text}</p>
                        </div>
                      ))
                    ) : <div className="text-center text-xs text-gray-400 py-10">Нет комментариев</div>}
                  </div>
                  <div className="flex-shrink-0 bg-white p-2 rounded-xl border shadow-sm focus-within:ring-2 ring-blue-500 transition-shadow">
                    <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать..." className="w-full text-sm outline-none resize-none min-h-[60px]" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                    <div className="flex justify-between items-center mt-2 border-t pt-2"><span className="text-[10px] text-gray-400">Ctrl + Enter</span><button onClick={handleAddComment} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">Отправить</button></div>
                  </div>
                </div>
              </>
            ) : (
              // ВАРИАНТ ДЛЯ ИСПОЛНИТЕЛЯ
              <>
                <div className="flex-1 flex flex-col space-y-6">
                  <div className="flex justify-between items-start border-b pb-4"><h3 className="text-2xl font-bold text-gray-800">#{editingTask.id} {editingTask.title}</h3></div>
                  <div className="flex-1 flex flex-col border border-gray-200 rounded-xl shadow-sm overflow-hidden min-h-[400px] bg-white">
                    <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center"><span className="text-lg mr-2">💬</span><h4 className="font-bold text-gray-700">Обсуждение задачи</h4></div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
                      {editingTask.comments && editingTask.comments.length > 0 ? (
                        editingTask.comments.map(c => (
                          <div key={c.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-bold text-blue-600 text-sm">{c.author_name}</span>
                              <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-gray-700 whitespace-pre-wrap">{c.text}</p>
                          </div>
                        ))
                      ) : <div className="text-center text-sm text-gray-400 py-16 flex flex-col items-center"><span className="text-4xl mb-3">📭</span>Здесь пока нет сообщений.</div>}
                    </div>
                    <div className="p-4 bg-gray-50 border-t border-gray-200 focus-within:bg-white transition-colors">
                      <textarea value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Написать сообщение участникам..." className="w-full text-sm outline-none resize-none min-h-[80px] bg-transparent" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(e); }} />
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200/60"><span className="text-xs text-gray-400 font-medium">Подсказка: Ctrl + Enter для отправки</span><button onClick={handleAddComment} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-md">Отправить сообщение</button></div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">📎 Вложения</h4>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {editingTask.attachments && editingTask.attachments.map(att => (
                        <div key={att.id} className="relative text-xs bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors flex flex-col shadow-sm min-w-[160px] max-w-xs group">
                          {canEdit && (
                            <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white shadow-sm font-bold z-10" title="Удалить файл">✕</button>
                          )}
                          <a href={att.file} target="_blank" rel="noreferrer" className="text-xs bg-gray-100 border border-gray-200 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors flex items-center shadow-sm"><span className="mr-2 text-blue-500">📄</span> <span className="truncate">{att.file ? att.file.split('/').pop() : `Файл ${att.id}`}</span></a>
                          {(att.uploaded_by_name || att.upload_at) && (
                            <div className="text-[10px] text-gray-500 mt-1 pt-1 border-t border-gray-200/60 flex flex-col space-y-0.5">
                              {att.uploaded_by_name && <span className="truncate">👤 {att.uploaded_by_name}</span>}
                              {att.upload_at && <span>📅 {new Date(att.upload_at).toLocaleDateString('ru-RU')}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                      {(!editingTask.attachments || editingTask.attachments.length === 0) && <span className="text-xs text-gray-400">Нет прикрепленных файлов</span>}
                    </div>
                    <input type="file" onChange={handleFileUpload} className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors" />
                  </div>
                </div>
                <div className="w-80 border-l pl-6 flex flex-col bg-gray-50 -my-8 -mr-8 p-8 overflow-y-auto">
                  <h4 className="text-lg font-bold text-gray-800 mb-6 flex-shrink-0">Детали задачи</h4>
                  <div className="space-y-6">
                    <div className="bg-blue-100/60 text-blue-800 p-4 rounded-xl text-xs border border-blue-200 font-medium leading-relaxed"><span className="block mb-1 text-lg">👷‍♂️</span> Вы исполнитель. <br/>Следите за дедлайном.</div>
                    <div className="space-y-4">
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Ответственный</span><p className="font-semibold text-gray-800 text-sm">{userOptions.find(o => o.value == (editingTask.assignee?.id ?? editingTask.assignee))?.label || 'Не назначен'}</p></div>
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Сроки</span><div className="flex items-center text-sm font-semibold text-gray-800">{editingTask.plan_start_date || '—'} <span className="text-gray-400 mx-2">→</span> <span className={editingTask.plan_end_date < today && editingTask.status !== 'completed' ? 'text-red-500 font-bold' : ''}>{editingTask.plan_end_date || '—'}</span></div></div>
                      <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Описание</span><div className="text-gray-700 text-xs whitespace-pre-wrap bg-white p-3 rounded-lg border border-gray-200/60 shadow-sm min-h-[80px]">{editingTask.description || <span className="text-gray-400 italic">Описание отсутствует</span>}</div></div>
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
          </div>
          <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 flex space-x-4 z-[60]">
             <button onClick={() => setIsEditModalOpen(false)} className="px-8 py-3 bg-white text-gray-700 rounded-full shadow-xl font-bold hover:bg-gray-50 transition-all">Закрыть окно</button>
             {canEdit && <button type="submit" form="editForm" className="px-8 py-3 bg-blue-600 text-white rounded-full shadow-xl font-bold hover:bg-blue-700 transition-all">Сохранить изменения</button>}
          </div>
        </div>
      )}

      {/* --- МОДАЛКА ПРИЧИНЫ ПРОСРОЧКИ --- */}
      {isCompletionModalOpen && taskToComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md border-t-8 border-red-500">
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-2xl font-bold text-gray-800">Задача просрочена</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">Вы пытаетесь завершить задачу <strong className="text-gray-800">"{taskToComplete.title}"</strong>. Её дедлайн был <span className="font-bold text-red-500">{taskToComplete.plan_end_date}</span>. Пожалуйста, укажите причину задержки.</p>
            <form onSubmit={handleConfirmCompletion}>
              <textarea value={completionDelayReason} onChange={(e) => setCompletionDelayReason(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] mb-6 text-sm" placeholder="Укажите причину..." required />
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setIsCompletionModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-5 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium shadow-md transition-colors">Завершить задачу</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyTasks;