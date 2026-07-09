import React, { useState, useEffect, useRef, useMemo } from 'react';
import Select from 'react-select';
import api from '../api'; // Твой настроенный axios instance

function Tickets() {
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'list', 'admin'
  const [loading, setLoading] = useState(true);

  // Данные с бэкенда
  const [modules, setModules] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]); // Для выбора исполнителей в админке
  const [currentUser, setCurrentUser] = useState(null);
  const [isFullAccess, setIsFullAccess] = useState(false);

  // Стейты формы создания
  const [moduleId, setModuleId] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [anydesk, setAnydesk] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const fileInputRef = useRef(null);

  // Стейты списка
  const [filterModule, setFilterModule] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Стейт админки
  const [newModuleName, setNewModuleName] = useState('');

  // === ЗАГРУЗКА ДАННЫХ ===
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Запрашиваем модули, тикеты и пользователей параллельно
      const [modRes, tickRes, usersRes] = await Promise.all([
        api.get('support/modules/'),
        api.get('support/tickets/'),
        api.get('users/').catch(() => ({ data: [] })) // Если эндпоинт users другой, поправь здесь
      ]);

      setModules(modRes.data.results || modRes.data);
      setTickets(tickRes.data.results || tickRes.data);

      const usersList = usersRes.data.results || usersRes.data;
      setUsers(usersList);

      // Определяем права пользователя (админ может видеть вкладку "Админ" и удалять всё)
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = usersList.find(u => u.id === payload.user_id) || { id: payload.user_id, role: payload.role };
        setCurrentUser(user);
        setIsFullAccess(user.role === 'admin' || user.role === 'director' || user.is_superuser);
      }
    } catch (error) {
      console.error("Ошибка при загрузке данных:", error);
    } finally {
      setLoading(false);
    }
  };

  // === СОЗДАНИЕ ЗАЯВКИ ===
  const handleFileChange = (e) => {
    setScreenshot(e.target.files[0] || null);
  };

  const clearForm = () => {
    setModuleId(''); setUrgency('normal'); setTitle(''); setDesc(''); setAnydesk(''); setScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!moduleId || !title.trim() || !desc.trim()) return alert("Заполните обязательные поля!");

    const formData = new FormData();
    formData.append('module', moduleId);
    formData.append('title', title.trim());
    formData.append('description', desc.trim());
    formData.append('urgency', urgency);
    if (anydesk) formData.append('anydesk', anydesk.trim());
    if (screenshot) formData.append('screenshot', screenshot);

    try {
      await api.post('support/tickets/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert("Заявка успешно создана!");
      clearForm();
      fetchData(); // Обновляем список
      setActiveTab('list');
    } catch (error) {
      alert("Ошибка при создании заявки.");
      console.error(error);
    }
  };

  // === УПРАВЛЕНИЕ ЗАЯВКАМИ ===
  const handleChangeStatus = async (ticketId, currentStatus) => {
    const nextStatus = currentStatus === 'new' ? 'progress' : currentStatus === 'progress' ? 'closed' : 'new';
    try {
      await api.patch(`support/tickets/${ticketId}/`, { status: nextStatus });
      fetchData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: nextStatus });
      }
    } catch (error) {
      alert("Ошибка при изменении статуса.");
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    if (!window.confirm(`Удалить заявку №${ticketId}?`)) return;
    try {
      await api.delete(`support/tickets/${ticketId}/`);
      setSelectedTicket(null);
      fetchData();
    } catch (error) {
      alert("Ошибка при удалении заявки.");
    }
  };

  // === АДМИНКА (МОДУЛИ) ===
  const handleAddModule = async () => {
    if (!newModuleName.trim()) return;
    try {
      await api.post('support/modules/', { name: newModuleName.trim(), assignees: [] });
      setNewModuleName('');
      fetchData();
    } catch (error) {
      alert("Ошибка при добавлении модуля.");
    }
  };

  const handleDeleteModule = async (moduleId) => {
    if (!window.confirm("Удалить модуль? Все связанные заявки также будут удалены!")) return;
    try {
      await api.delete(`support/modules/${moduleId}/`);
      fetchData();
    } catch (error) {
      alert("Ошибка при удалении модуля.");
    }
  };

  const handleUpdateAssignees = async (moduleId, selectedOptions) => {
    const assigneeIds = selectedOptions ? selectedOptions.map(opt => opt.value) : [];
    try {
      await api.patch(`support/modules/${moduleId}/`, { assignees: assigneeIds });
      fetchData();
    } catch (error) {
      alert("Ошибка при обновлении исполнителей.");
    }
  };

  // === ФИЛЬТРАЦИЯ СПИСКА ===
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchMod = filterModule === 'all' || t.module === parseInt(filterModule);
      const matchStat = filterStatus === 'all' || t.status === filterStatus;
      return matchMod && matchStat;
    });
  }, [tickets, filterModule, filterStatus]);

  const userOptions = users.map(u => ({ value: u.id, label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username }));

  if (loading) return <div className="p-12 text-center text-gray-500 font-medium">Загрузка системы заявок...</div>;

  return (
    <div className="h-full flex flex-col">
      {/* ШАПКА */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-2">
            <span className="bg-red-500 text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg shadow-sm">S</span>
            СТЭК — Заявки ПО
          </h1>
          <p className="text-sm text-gray-500 mt-1">Внутренняя поддержка и разработка</p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 w-full sm:w-auto">
          <button onClick={() => {setActiveTab('create'); setSelectedTicket(null);}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'create' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📝 Создать</button>
          <button onClick={() => {setActiveTab('list'); setSelectedTicket(null);}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📋 Все заявки</button>
          {isFullAccess && (
            <button onClick={() => {setActiveTab('admin'); setSelectedTicket(null);}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>⚙️ Админ</button>
          )}
        </div>
      </div>

      {/* СОЗДАНИЕ ЗАЯВКИ */}
      {activeTab === 'create' && (
        <div className="max-w-4xl mx-auto w-full">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-bold text-blue-800 mb-3">📸 Как правильно сделать скриншот ошибки</h3>
            <ol className="list-decimal pl-5 text-sm text-blue-900 space-y-2">
              <li>Сделайте скриншот поля или страницы с ошибкой.</li>
              <li>Если ошибка техническая, нажмите <code className="bg-white px-1.5 py-0.5 rounded text-blue-600 font-bold border border-blue-200">F12</code>, перейдите на вкладку <code className="bg-white px-1.5 py-0.5 rounded text-blue-600 font-bold border border-blue-200">Response</code> и сделайте скриншот.</li>
            </ol>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50"><h2 className="font-bold text-gray-800">Оформление новой заявки</h2></div>
            <form onSubmit={handleSubmitTicket} className="p-5 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Модуль / Проект *</label>
                  <select value={moduleId} onChange={e => setModuleId(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
                    <option value="">Выберите модуль...</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Срочность</label>
                  <select value={urgency} onChange={e => setUrgency(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                    <option value="normal">🟢 Обычная</option><option value="high">🟡 Срочно</option><option value="critical">🔴 Критическая</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Заголовок *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Кратко опишите проблему" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-semibold" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Описание проблемы *</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Шаги для воспроизведения, что произошло..." className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] text-sm" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Скриншот ошибки</label>
                <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${screenshot ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}>
                  {screenshot ? <span className="font-bold text-green-700">✅ Прикреплен: {screenshot.name}</span> : <span className="text-sm font-medium text-gray-500">📎 Нажмите, чтобы прикрепить картинку</span>}
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Номер AnyDesk</label>
                <input type="text" value={anydesk} onChange={e => setAnydesk(e.target.value)} placeholder="XXX XXX XXX" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-50">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-colors">Отправить заявку</button>
                <button type="button" onClick={clearForm} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-2.5 rounded-lg font-bold transition-colors">Очистить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* СПИСОК ЗАЯВОК */}
      {activeTab === 'list' && !selectedTicket && (
        <div className="flex-1 flex flex-col">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Все модули</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Все статусы</option><option value="new">Новые</option><option value="progress">В работе</option><option value="closed">Закрытые</option>
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="overflow-x-auto h-full">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase font-bold sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-4 w-16">№</th><th className="px-5 py-4 w-40">Модуль</th><th className="px-5 py-4 min-w-[200px]">Заголовок</th>
                    <th className="px-5 py-4 w-32">Срочность</th><th className="px-5 py-4 w-40">Исполнители</th><th className="px-5 py-4 w-32">Статус</th>
                    <th className="px-5 py-4 w-24 text-right">Дата</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredTickets.length > 0 ? filteredTickets.map(t => {
                    const asgs = t.assignees?.map(a => a.name).join(', ') || '—';
                    return (
                      <tr key={t.id} onClick={() => setSelectedTicket(t)} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-5 py-4 font-bold text-gray-400">#{t.id}</td>
                        <td className="px-5 py-4 font-medium text-gray-600">{t.module_name}</td>
                        <td className="px-5 py-4 font-bold text-blue-600 truncate max-w-[300px]">{t.title}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-md ${t.urgency === 'critical' ? 'bg-red-100 text-red-700' : t.urgency === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {t.urgency === 'critical' ? '🔴 Крит.' : t.urgency === 'high' ? '🟡 Срочно' : '🟢 Обычная'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-gray-500 truncate max-w-[150px]">{asgs}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-md ${t.status === 'new' ? 'bg-blue-100 text-blue-700' : t.status === 'progress' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {t.status === 'new' ? 'Новая' : t.status === 'progress' ? 'В работе' : 'Закрыта'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-400 font-medium text-right">{new Date(t.created_at).toLocaleDateString('ru-RU')}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan="7" className="text-center py-12 text-gray-400 font-medium"><span className="text-4xl block mb-2">📭</span> Заявок не найдено</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ДЕТАЛЬНЫЙ ПРОСМОТР */}
      {activeTab === 'list' && selectedTicket && (
        <div className="max-w-4xl mx-auto w-full">
          <button onClick={() => setSelectedTicket(null)} className="text-sm font-bold text-blue-500 hover:text-blue-700 mb-4 inline-flex items-center gap-1">← К списку заявок</button>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Заявка #{selectedTicket.id} | Автор: {selectedTicket.author_name}</span>
                <h2 className="text-2xl font-bold text-gray-900 break-words leading-tight">{selectedTicket.title}</h2>
              </div>
              <span className={`px-3 py-1 text-xs uppercase font-bold rounded-md shrink-0 ml-4 ${selectedTicket.status === 'new' ? 'bg-blue-100 text-blue-700' : selectedTicket.status === 'progress' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                {selectedTicket.status === 'new' ? 'Новая' : selectedTicket.status === 'progress' ? 'В работе' : 'Закрыта'}
              </span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-gray-100">
                <div><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Модуль</span><span className="text-sm font-semibold text-gray-800">{selectedTicket.module_name}</span></div>
                <div><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Срочность</span><span className="text-sm font-semibold text-gray-800">{selectedTicket.urgency === 'critical' ? '🔴 Критическая' : selectedTicket.urgency === 'high' ? '🟡 Срочная' : '🟢 Обычная'}</span></div>
                <div><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Создана</span><span className="text-sm font-semibold text-gray-800">{new Date(selectedTicket.created_at).toLocaleString('ru-RU')}</span></div>
                {selectedTicket.anydesk && <div><span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">AnyDesk</span><span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{selectedTicket.anydesk}</span></div>}
              </div>

              <div className="mb-6">
                <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Исполнители модуля</span>
                <div className="flex flex-wrap gap-2">
                  {selectedTicket.assignees?.map(a => <span key={a.id} className="text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md">👤 {a.name}</span>)}
                  {(!selectedTicket.assignees || selectedTicket.assignees.length === 0) && <span className="text-xs text-gray-400 italic">Не назначены</span>}
                </div>
              </div>

              <div className="mb-8">
                <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Описание проблемы</span>
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-white border border-gray-200 p-4 rounded-xl shadow-inner">{selectedTicket.description}</div>
              </div>

              {selectedTicket.screenshot && (
                <div className="mb-8">
                  <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Скриншот</span>
                  <a href={selectedTicket.screenshot} target="_blank" rel="noopener noreferrer">
                    <img src={selectedTicket.screenshot} alt="Скриншот" className="max-w-full rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:opacity-90" />
                  </a>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-gray-100">
                {(isFullAccess || selectedTicket.assignees?.some(a => a.id === currentUser?.id)) && (
                  <button onClick={() => handleChangeStatus(selectedTicket.id, selectedTicket.status)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-2 rounded-lg font-bold transition-colors border border-gray-300">Изменить статус</button>
                )}
                {isFullAccess && (
                  <button onClick={() => {handleDeleteTicket(selectedTicket.id); setActiveTab('list');}} className="bg-red-50 hover:bg-red-100 text-red-600 px-5 py-2 rounded-lg font-bold transition-colors border border-red-200 ml-auto">Удалить заявку</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* АДМИНКА */}
      {activeTab === 'admin' && isFullAccess && (
        <div className="max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-gray-800">Управление модулями и исполнителями</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {modules.map(m => (
                <div key={m.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base text-gray-800">{m.name}</span>
                    <button onClick={() => handleDeleteModule(m.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-bold text-xs border border-transparent hover:border-red-200">Удалить</button>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Ответственные IT-специалисты</label>
                    <Select
                      isMulti
                      options={userOptions}
                      value={userOptions.filter(o => m.assignees.includes(o.value))}
                      onChange={(selected) => handleUpdateAssignees(m.id, selected)}
                      placeholder="Выберите сотрудников..."
                      className="text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex gap-2">
              <input type="text" value={newModuleName} onChange={e => setNewModuleName(e.target.value)} placeholder="Название нового модуля" className="flex-1 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              <button onClick={handleAddModule} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm">Добавить модуль</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tickets;