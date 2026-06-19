import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';

function TaskStandalone() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Состояния для комментариев и файлов
  const [newComment, setNewComment] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Получаем текущего юзера из токена для проверки прав
        const token = localStorage.getItem('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userRes = await api.get(`users/${payload.user_id}/`);
          setCurrentUser(userRes.data);
        }

        // 2. Получаем саму задачу
        const taskRes = await api.get(`tasks/${id}/`);
        setTask(taskRes.data);
      } catch (err) {
        setError('Не удалось загрузить задачу. Возможно, она удалена или у вас нет доступа.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Проверка прав (кто открыл карточку?)
  const isBoss = currentUser && task && (
    currentUser.role === 'admin' ||
    currentUser.role === 'director' ||
    currentUser.id === task.project_details?.owner ||
    currentUser.id === task.project_details?.manager
  );

  const isAssignee = currentUser && task && currentUser.id === task.assignee;
  const canEditStatus = isBoss || isAssignee;

  // ОБРАБОТЧИКИ ДЕЙСТВИЙ
  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.patch(`tasks/${id}/`, { status: newStatus });
      setTask(res.data);
    } catch (err) {
      alert("Ошибка при обновлении статуса");
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const res = await api.post(`tasks/${id}/add_comment/`, { text: newComment });
      setTask({ ...task, comments: [...task.comments, res.data] });
      setNewComment('');
    } catch (err) {
      alert("Ошибка отправки комментария");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`tasks/${id}/upload_files/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTask({ ...task, attachments: [...task.attachments, res.data] });
    } catch (err) {
      alert("Ошибка загрузки файла");
    } finally {
      setUploadingFile(false);
    }
  };

  // Экраны загрузки и ошибки
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
    <div className="max-w-6xl mx-auto mt-4 md:mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col md:flex-row min-h-[75vh]">

      {/* === ЛЕВАЯ КОЛОНКА (Инфо и Комментарии) === */}
      <div className="w-full md:w-2/3 p-6 md:p-8 flex flex-col border-b md:border-b-0 md:border-r border-gray-100">

        {/* Шапка */}
        <div className="mb-6">
          <Link to={`/projects/${task.project}`} className="text-sm font-bold text-blue-500 hover:text-blue-700 transition uppercase tracking-wider mb-2 inline-flex items-center">
            ← Проект #{task.project}
          </Link>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight mt-1">{task.title}</h1>
        </div>

        {/* Описание */}
        <div className="prose max-w-none text-gray-700 bg-slate-50 p-5 rounded-xl border border-slate-100 mb-8 min-h-[100px]">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Описание</h3>
          {task.description ? (
            <p className="whitespace-pre-wrap">{task.description}</p>
          ) : (
            <p className="italic text-gray-400">Описание не предоставлено.</p>
          )}
        </div>

        {/* Секция комментариев */}
        <div className="flex-1 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">💬</span> Обсуждение ({task.comments?.length || 0})
          </h3>

          <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
            {task.comments?.map(comment => (
              <div key={comment.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-gray-800 text-sm">{comment.author_details?.first_name} {comment.author_details?.last_name}</span>
                  <span className="text-xs text-gray-400 font-medium">{new Date(comment.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.text}</p>
              </div>
            ))}
            {task.comments?.length === 0 && <div className="text-center text-gray-400 text-sm py-6">Нет комментариев. Будьте первыми!</div>}
          </div>

          <form onSubmit={handleCommentSubmit} className="mt-auto relative">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Напишите комментарий..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none resize-none pr-28"
              rows="2"
            />
            <button type="submit" disabled={!newComment.trim()} className="absolute right-2 bottom-2 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition shadow-sm">
              Отправить
            </button>
          </form>
        </div>
      </div>

      {/* === ПРАВАЯ КОЛОНКА (Статусы, Дедлайны, Файлы) === */}
      <div className="w-full md:w-1/3 bg-slate-50 p-6 md:p-8 flex flex-col">

        {/* Блок статуса */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Статус задачи</h3>
          {canEditStatus ? (
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`w-full font-bold text-sm rounded-xl px-4 py-3 outline-none border shadow-sm transition appearance-none cursor-pointer
                ${task.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : 
                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                  'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
              `}
            >
              <option value="new">🆕 Новая</option>
              <option value="in_progress">⏳ В работе</option>
              <option value="completed">✅ Завершена</option>
            </select>
          ) : (
            <div className={`font-bold text-sm rounded-xl px-4 py-3 inline-flex items-center w-full justify-center
              ${task.status === 'completed' ? 'bg-green-100 text-green-800 border border-green-200' : 
                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-gray-200 text-gray-700 border border-gray-300'}`}>
              {task.status === 'completed' ? '✅ Завершена' : task.status === 'in_progress' ? '⏳ В работе' : '🆕 Новая'}
            </div>
          )}
        </div>

        {/* Блок информации о задаче */}
        <div className="space-y-6 mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">Исполнитель</p>
            <div className="flex items-center mt-2">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs mr-3">
                {task.assignee_details?.first_name?.[0] || 'U'}
              </div>
              <span className="font-semibold text-gray-800 text-sm">
                {task.assignee_details?.first_name} {task.assignee_details?.last_name}
                {(!task.assignee_details?.first_name && task.assignee) ? `ID: ${task.assignee}` : ''}
                {!task.assignee && 'Не назначен'}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Дата старта</p>
              <p className="font-semibold text-gray-800 text-sm mt-1">{task.plan_start_date ? new Date(task.plan_start_date).toLocaleDateString('ru-RU') : '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-400 uppercase">Дедлайн</p>
              <p className={`font-semibold text-sm mt-1 ${task.plan_end_date && new Date(task.plan_end_date) < new Date() && task.status !== 'completed' ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded' : 'text-gray-800'}`}>
                {task.plan_end_date ? new Date(task.plan_end_date).toLocaleDateString('ru-RU') : '—'}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
             <p className="text-xs font-bold text-gray-400 uppercase mb-2">Приоритет</p>
             <span className={`px-3 py-1.5 text-xs font-bold rounded-lg inline-block ${
                task.priority === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                task.priority === 'high' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                'bg-gray-100 text-gray-700 border border-gray-200'
             }`}>
               {task.priority === 'critical' ? '🔥 Критичный' : task.priority === 'high' ? '⚡ Высокий' : task.priority === 'medium' ? 'Средний' : 'Низкий'}
             </span>
          </div>
        </div>

        {/* Секция Файлов */}
        <div className="mt-auto">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Приложения ({task.attachments?.length || 0})</h3>

          <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-1">
            {task.attachments?.map(file => (
              <a key={file.id} href={file.file} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition group">
                <span className="text-xl mr-3 opacity-70 group-hover:opacity-100 transition">📄</span>
                <span className="text-sm text-blue-600 font-medium truncate flex-1" title={file.file.split('/').pop()}>
                  {decodeURIComponent(file.file.split('/').pop())}
                </span>
              </a>
            ))}
          </div>

          {/* Загрузка файла доступна Исполнителю и Боссу */}
          {(canEditStatus) && (
            <div className="relative">
              <input type="file" id="file-upload" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
              <label htmlFor="file-upload" className={`flex items-center justify-center w-full py-3 px-4 border-2 border-dashed rounded-xl text-sm font-bold transition cursor-pointer
                ${uploadingFile ? 'border-gray-300 text-gray-400 bg-gray-100' : 'border-blue-300 text-blue-600 bg-white hover:bg-blue-50 hover:border-blue-400'}`}>
                {uploadingFile ? '⏳ Загрузка...' : '📎 Прикрепить файл'}
              </label>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default TaskStandalone;