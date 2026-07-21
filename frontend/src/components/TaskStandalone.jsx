import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import api from '../api';

function TaskStandalone() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newComment, setNewComment] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionDelayReason, setCompletionDelayReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        let currentUsr = null;
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userRes = await api.get(`users/${payload.user_id}/`);
          currentUsr = userRes.data;
          setCurrentUser(currentUsr);
        }

        const [taskRes, usersRes, projectsRes] = await Promise.all([
          api.get(`tasks/${id}/`),
          api.get('users/').catch(() => ({ data: [] })),
          api.get('projects/').catch(() => ({ data: [] }))
        ]);

        setTask(taskRes.data);
        setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.results || []);
        setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : projectsRes.data?.results || []);
      } catch (err) {
        setError('Не удалось загрузить задачу. Возможно, она удалена или у вас нет доступа.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const isRoleManager = currentUser?.role === 'manager';
  const isBoss = currentUser && task && (
    currentUser.role === 'admin' ||
    currentUser.role === 'director' ||
    currentUser.is_superuser ||
    currentUser.id === task.project_details?.owner ||
    currentUser.id === task.project_details?.manager ||
    (task.project_details?.visibility === 'selected' && task.project_details?.allowed_users?.includes(currentUser.id)) ||
    (task.project_details?.visibility === 'all' && isRoleManager)
  );

  const isAssignee = currentUser && task && currentUser.id === (task.assignee?.id ?? task.assignee);
  const isExecutor = currentUser && task && currentUser.id === (task.executor?.id ?? task.executor);
  const isParticipant = currentUser && task && (task.participants || []).some(p => (typeof p === 'object' ? p.id : p) == currentUser.id);

  const canEditAll = isBoss;
  const canEditStatus = isBoss || isAssignee || isExecutor || isParticipant;
  const canInteract = true;

  const userOptions = useMemo(() => users.map(u => ({
    value: u.id,
    label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || `Сотрудник №${u.id}`
  })), [users]);

  const projectOptions = useMemo(() => projects.map(p => ({
    value: p.id,
    label: p.title
  })), [projects]);

  const handleOpenEdit = () => {
    setEditFormData({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'new',
      plan_start_date: task.plan_start_date || '',
      plan_end_date: task.plan_end_date || '',
      assignee: task.assignee?.id ?? task.assignee ?? null,
      executor: task.executor?.id ?? task.executor ?? null,
      participants: (task.participants || []).map(p => typeof p === 'object' ? p.id : p),
      priority: task.priority || 'medium',
      project: task.project || null,
      is_milestone: task.is_milestone || false,
      law_type: task.law_type || 'other'
    });
    setIsEditMode(true);
  };

  const handleUpdateTask = async (e) => {
    if (e) e.preventDefault();
    if (!editFormData.plan_start_date || !editFormData.plan_end_date) return alert("Укажите даты.");
    if (new Date(editFormData.plan_start_date) > new Date(editFormData.plan_end_date)) return alert("Неверные даты.");

    const isOverdue = task.plan_end_date && new Date(task.plan_end_date) < new Date(today);

    if (editFormData.status === 'completed' && isOverdue && task.status !== 'completed') {
      setPendingStatus('completed_from_edit');
      setIsCompletionModalOpen(true);
      return;
    }
    await saveTaskChanges();
  };

  const saveTaskChanges = async (delayReason = '') => {
    try {
      const payload = { ...editFormData };
      if (delayReason) {
        payload.delay_reason = delayReason;
        payload.actual_end_date = today;
      }

      const res = await api.patch(`tasks/${id}/`, payload);
      setTask(res.data);
      setIsEditMode(false);
      setIsCompletionModalOpen(false);
      setCompletionDelayReason('');
      setPendingStatus(null);
    } catch (err) {
      alert("Ошибка при сохранении задачи");
    }
  };

  const handleStatusSelect = (e) => {
    const newStatus = e.target.value;
    const isOverdue = task.plan_end_date && new Date(task.plan_end_date) < new Date(today);

    if (newStatus === 'completed' && isOverdue && !isParticipant) {
      setPendingStatus(newStatus);
      setIsCompletionModalOpen(true);
    } else {
      executeQuickStatusChange(newStatus);
    }
  };

  const executeQuickStatusChange = async (newStatus, delayReason = '') => {
    try {
      const payload = { status: newStatus };
      if (delayReason) {
        payload.delay_reason = delayReason;
        payload.actual_end_date = today;
      }
      if (isParticipant && !isAssignee && !isExecutor && !isBoss) {
        payload.personal_only = true;
      }

      const res = await api.patch(`tasks/${id}/`, payload);
      setTask(res.data);
      setIsCompletionModalOpen(false);
      setCompletionDelayReason('');
      setPendingStatus(null);
    } catch (err) {
      alert("Ошибка при обновлении статуса");
    }
  };

  const handleConfirmCompletion = (e) => {
    e.preventDefault();
    if (!completionDelayReason.trim()) return alert("Укажите причину просрочки!");
    if (pendingStatus === 'completed_from_edit') saveTaskChanges(completionDelayReason);
    else executeQuickStatusChange(pendingStatus, completionDelayReason);
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const res = await api.post(`tasks/${id}/add_comment/`, { text: newComment });
      setTask({ ...task, comments: [...task.comments, res.data] });
      setNewComment('');
    } catch (err) { alert("Ошибка отправки комментария"); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`tasks/${id}/upload_files/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTask({ ...task, attachments: [...task.attachments, res.data] });
    } catch (err) { alert("Ошибка загрузки файла"); }
    finally { setUploadingFile(false); }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Удалить файл?")) return;
    try {
      await api.delete(`attachments/${attachmentId}/`);
      setTask({ ...task, attachments: task.attachments.filter(a => a.id !== attachmentId) });
    } catch (error) { alert("Ошибка при удалении файла."); }
  };

  if (loading) return <div className="p-10 flex justify-center items-center h-full text-gray-500 font-medium">Загрузка данных задачи...</div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center mt-20 text-center p-4">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Доступ закрыт</h2>
      <p className="text-gray-500 mb-6">{error}</p>
      <button onClick={() => navigate('/')} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">Вернуться на главную</button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto mt-4 md:mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col md:flex-row min-h-[75vh] mb-12">

      <div className="w-full md:w-2/3 flex flex-col border-b md:border-b-0 md:border-r border-gray-100">
        {isEditMode ? (
          <div className="p-6 md:p-8 flex-1 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">Редактирование задачи #{task.id}</span>
              <button onClick={() => setIsEditMode(false)} className="text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">✕ Отмена</button>
            </div>

            <form id="standaloneEditForm" onSubmit={handleUpdateTask} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Название задачи</label>
                <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} className="w-full text-xl font-bold text-gray-800 bg-white border border-gray-300 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>

              <div className="flex items-center">
                <input type="checkbox" id="sa_is_milestone" checked={editFormData.is_milestone || false} onChange={(e) => setEditFormData({...editFormData, is_milestone: e.target.checked})} className="mr-2 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                <label htmlFor="sa_is_milestone" className="text-sm font-bold text-gray-700 cursor-pointer select-none">🚩 Отметить как веху (Milestone)</label>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Описание</label>
                <textarea value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full p-4 border border-gray-300 rounded-xl min-h-[250px] outline-none focus:ring-2 focus:ring-blue-500 resize-y text-gray-700" placeholder="Подробное описание задачи..." />
              </div>
            </form>
          </div>
        ) : (
          <div className="p-6 md:p-8 flex flex-col h-full">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <Link to={`/projects/${task.project}`} className="text-sm font-bold text-blue-500 hover:text-blue-700 transition uppercase tracking-wider mb-2 inline-flex items-center">
                  ← Проект #{task.project}
                </Link>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded">#{task.id}</span>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight">
                    {task.is_milestone && <span className="mr-2" title="Веха">🚩</span>}
                    {task.title}
                  </h1>
                </div>
              </div>

              {canEditAll && (
                <button onClick={handleOpenEdit} className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-xl font-bold transition-colors border border-gray-200 shadow-sm flex items-center gap-1.5 shrink-0 ml-4">
                  <span>✏️</span> Редактировать
                </button>
              )}
            </div>

            <div className="prose max-w-none text-gray-700 bg-slate-50 p-5 rounded-xl border border-slate-100 mb-8 min-h-[100px]">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Описание</h3>
              {task.description ? <p className="whitespace-pre-wrap leading-relaxed">{task.description}</p> : <p className="italic text-gray-400">Описание не предоставлено.</p>}
            </div>

            <div className="flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">💬</span> Обсуждение ({task.comments?.length || 0})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
                {[...(task.comments || [])]
                  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  .map(comment => {
                  const isMe = currentUser && comment.author_details && currentUser.id === comment.author_details.id;
                  return (
                    <div key={comment.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'}`}>
                        <div className="flex justify-between items-end mb-1 gap-4">
                          {!isMe && <span className="font-bold text-xs text-blue-600">{comment.author_details?.first_name} {comment.author_details?.last_name}</span>}
                          <span className={`text-[10px] font-medium opacity-70 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                            {new Date(comment.created_at).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  );
                })}
                {task.comments?.length === 0 && <div className="text-center text-gray-400 text-sm py-6 opacity-70"><span className="text-4xl mb-2 block">📭</span>Здесь пока тихо. Напишите первым!</div>}
              </div>

              {canInteract && (
                <form onSubmit={handleCommentSubmit} className="mt-auto relative focus-within:ring-2 focus-within:ring-blue-500 rounded-xl transition-all shadow-sm">
                  <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Напишите сообщение..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none resize-none pr-32 min-h-[60px]" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommentSubmit(e); }} />
                  <button type="submit" disabled={!newComment.trim()} className="absolute right-2 bottom-2 px-5 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition shadow-sm">Отправить</button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full md:w-1/3 bg-slate-50 p-6 md:p-8 flex flex-col border-l border-gray-100">

        {isEditMode ? (
          <div className="flex-1 flex flex-col h-full">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Настройки задачи</h3>
            <div className="space-y-4 flex-1">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Проект</label><Select options={projectOptions} value={projectOptions.find(o => o.value == editFormData.project) || null} onChange={(opt) => setEditFormData({...editFormData, project: opt ? opt.value : null})} placeholder="Выбрать проект..." /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Статус</label>
                <select value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white font-medium">
                  <option value="new">🆕 Новая</option><option value="in_progress">⚙️ В работе</option><option value="delayed">⏸️ В отсрочке</option><option value="completed">✅ Завершена</option>
                </select>
              </div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Критичность</label>
                <select value={editFormData.priority} onChange={(e) => setEditFormData({...editFormData, priority: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white font-medium">
                  <option value="low">🟢 Низкая</option><option value="medium">🔵 Средняя</option><option value="high">🟣 Высокая</option><option value="critical">🔴 Критичная</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Старт *</label><input type="date" value={editFormData.plan_start_date || ''} onChange={e => setEditFormData({...editFormData, plan_start_date: e.target.value})} className="w-full border border-gray-300 px-3 py-2 rounded-lg outline-none text-sm font-medium" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Дедлайн *</label><input type="date" value={editFormData.plan_end_date || ''} onChange={e => setEditFormData({...editFormData, plan_end_date: e.target.value})} className="w-full border border-gray-300 px-3 py-2 rounded-lg outline-none text-sm font-medium" /></div>
              </div>

              <div><label className="block text-xs font-bold text-gray-500 mb-1">Ответственный</label><Select options={userOptions} value={userOptions.find(o => o.value == editFormData.assignee) || null} onChange={(opt) => setEditFormData({...editFormData, assignee: opt ? opt.value : null})} placeholder="Контролирует..." /></div>
              {/* НОВОЕ ПОЛЕ ИСПОЛНИТЕЛЯ */}
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Исполнитель</label><Select options={userOptions} value={userOptions.find(o => o.value == editFormData.executor) || null} onChange={(opt) => setEditFormData({...editFormData, executor: opt ? opt.value : null})} placeholder="Выполняет работу..." /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Участники</label><Select isMulti options={userOptions} value={userOptions.filter(o => editFormData.participants.includes(o.value))} onChange={(selected) => setEditFormData({...editFormData, participants: selected ? selected.map(s => s.value) : []})} placeholder="Наблюдатели..." /></div>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button type="submit" form="standaloneEditForm" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm">
                💾 Сохранить изменения
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`mb-6 p-4 rounded-xl border ${isParticipant && !isAssignee && !isExecutor && !isBoss ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {isParticipant && !isAssignee && !isExecutor && !isBoss ? 'Ваш личный статус' : 'Глобальный статус'}
              </h3>
              {canEditStatus ? (
                <select value={task.status} onChange={handleStatusSelect} className={`w-full font-bold text-sm rounded-lg px-4 py-2.5 outline-none border transition appearance-none cursor-pointer ${task.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200 focus:ring-green-500' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border-blue-200 focus:ring-blue-500' : task.status === 'delayed' ? 'bg-orange-100 text-orange-800 border-orange-200 focus:ring-orange-500' : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-white focus:ring-gray-400'}`}>
                  <option value="new">🆕 Новая</option><option value="in_progress">⚙️ В работе</option><option value="delayed">⏸️ В отсрочке</option><option value="completed">✅ Завершена</option>
                </select>
              ) : (
                <div className={`font-bold text-sm rounded-lg px-4 py-2.5 inline-flex items-center w-full justify-center ${task.status === 'completed' ? 'bg-green-100 text-green-800 border border-green-200' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border border-blue-200' : task.status === 'delayed' ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                  {task.status === 'completed' ? '✅ Завершена' : task.status === 'in_progress' ? '⚙️ В работе' : task.status === 'delayed' ? '⏸️ В отсрочке' : '🆕 Новая'}
                </div>
              )}
            </div>

            <div className="space-y-5 mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ответственный</p>
                <div className="flex items-center mt-1.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs mr-2">
                    {userOptions.find(o => o.value == (task.assignee?.id ?? task.assignee))?.label?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">
                    {userOptions.find(o => o.value == (task.assignee?.id ?? task.assignee))?.label || 'Не назначен'}
                  </span>
                </div>
              </div>

              {/* НОВЫЙ БЛОК: ИСПОЛНИТЕЛЬ */}
              <div className="border-t border-gray-50 pt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Исполнитель</p>
                <div className="flex items-center mt-1.5">
                  <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-xs mr-2">
                    {userOptions.find(o => o.value == (task.executor?.id ?? task.executor))?.label?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">
                    {userOptions.find(o => o.value == (task.executor?.id ?? task.executor))?.label || 'Не назначен'}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-50 pt-4">
                <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Участники</span>
                {task.participants && task.participants.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {task.participants.map((p, idx) => {
                      const pId = typeof p === 'object' ? p.id : p;
                      const pName = typeof p === 'object' && (p.first_name || p.last_name || p.username)
                        ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username
                        : userOptions.find(o => o.value == pId)?.label || `Сотрудник №${pId}`;

                      return (
                        <span key={idx} className="bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 px-2 py-1 rounded-md shadow-sm flex items-center gap-1">
                          <span className="text-gray-400">👤</span>
                          <span>{pName}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : <span className="text-xs font-semibold text-gray-400 italic">Нет участников</span>}
              </div>

              <div className="flex justify-between items-center border-t border-gray-50 pt-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Дата старта</p>
                  <p className="font-semibold text-gray-800 text-sm mt-1">{task.plan_start_date ? new Date(task.plan_start_date).toLocaleDateString('ru-RU') : '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Дедлайн</p>
                  <p className={`font-semibold text-sm mt-1 ${task.plan_end_date && new Date(task.plan_end_date) < new Date() && task.status !== 'completed' ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded' : 'text-gray-800'}`}>
                    {task.plan_end_date ? new Date(task.plan_end_date).toLocaleDateString('ru-RU') : '—'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-50 pt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Критичность</p>
                <span className={`px-2.5 py-1 text-[11px] uppercase tracking-wider font-bold rounded-md inline-flex items-center gap-1 ${task.priority === 'critical' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-purple-100 text-purple-700' : task.priority === 'low' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {task.priority === 'critical' ? '🔴 Критичная' : task.priority === 'high' ? '🟣 Высокая' : task.priority === 'low' ? '🟢 Низкая' : '🔵 Средняя'}
                </span>
              </div>
            </div>

            <div className="mt-auto">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📎 Вложения ({task.attachments?.length || 0})</h4>
              <div className="flex flex-col gap-2 mb-4 max-h-60 overflow-y-auto pr-1">
                {task.attachments?.map(att => (
                  <div key={att.id} className="relative text-xs bg-white border border-gray-200 p-2.5 rounded-xl flex flex-col shadow-sm group hover:border-blue-300 transition-all">
                    {canInteract && <button type="button" onClick={() => handleDeleteAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 shadow-sm font-bold z-10" title="Удалить">✕</button>}
                    <a href={att.file} target="_blank" rel="noreferrer" className="flex items-center font-semibold text-gray-700 hover:text-blue-600 truncate break-words mb-1.5"><span className="mr-2 text-base shrink-0">📄</span><span className="truncate" title={att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}>{att.file ? decodeURIComponent(att.file.split('/').pop()) : `Файл`}</span></a>
                    <div className="text-[10px] text-gray-400 border-t border-gray-50 pt-1.5 mt-auto flex flex-col gap-0.5 font-medium">
                      <span className="truncate text-gray-500 flex items-center gap-1"><span>👤</span> {att.uploaded_by_name || 'Сотрудник'}</span>
                      {att.upload_at && <span className="flex items-center gap-1"><span>🕒</span> {new Date(att.upload_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {canInteract && (
                <div className="relative">
                  <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                  <label htmlFor="file-upload" className={`flex items-center justify-center w-full py-2 px-4 border border-dashed rounded-xl text-xs font-bold transition cursor-pointer ${uploadingFile ? 'border-gray-300 text-gray-400 bg-gray-100' : 'border-blue-300 text-blue-600 bg-white hover:bg-blue-50 hover:border-blue-400'}`}>{uploadingFile ? '⏳ Загрузка...' : '📎 Прикрепить файл'}</label>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isCompletionModalOpen && (
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

    </div>
  );
}

export default TaskStandalone;