import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';

function Employees() {
  const [employees, setEmployees] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Фильтры
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  // Модалка
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Данные редактирования
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCabinet, setEditCabinet] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [hrNoteText, setHrNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('users/');
      const list = res.data.results || res.data;
      setEmployees(list);

      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const loggedInUser = list.find(u => u.id == payload.user_id);
        setCurrentUser(loggedInUser);
      }
    } catch (err) {
      console.error("Ошибка загрузки сотрудников:", err);
    } finally {
      setLoading(false);
    }
  };

  const allDepartments = useMemo(() => {
    const depts = new Set();
    employees.forEach(emp => {
      emp.department_names?.forEach(d => depts.add(d));
    });
    return Array.from(depts);
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
      const matchesSearch = fullName.includes(searchQuery.toLowerCase()) ||
                            (emp.username && emp.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesDept = selectedDept ? emp.department_names?.includes(selectedDept) : true;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchQuery, selectedDept]);

  const isMe = currentUser && selectedEmp && currentUser.id === selectedEmp.id;

  const isHRorBoss = currentUser && (
    currentUser.role === 'admin' ||
    currentUser.role === 'director' ||
    currentUser.is_superuser ||
    currentUser.department_names?.some(d => d.toLowerCase().includes('кадров'))
  );

  const isOnlyBoss = currentUser && (currentUser.role === 'admin' || currentUser.role === 'director' || currentUser.is_superuser);

  const handleCardClick = (emp) => {
    setSelectedEmp(emp);
    setEditFirstName(emp.first_name || '');
    setEditLastName(emp.last_name || '');
    setEditPhone(emp.phone_number || '');
    setEditCabinet(emp.cabinet || '');
    setEditPosition(emp.position || '');
    setHrNoteText(emp.hr_note || '');
    setIsEditMode(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = {};
    if (isMe) {
      payload.first_name = editFirstName;
      payload.last_name = editLastName;
      payload.phone_number = editPhone;
      payload.cabinet = editCabinet;
    }
    if (isHRorBoss) {
      payload.hr_note = hrNoteText;
    }
    if (isOnlyBoss) {
      payload.position = editPosition;
    }

    try {
      const res = await api.patch(`users/${selectedEmp.id}/update_profile/`, payload);
      setEmployees(prev => prev.map(u => u.id === selectedEmp.id ? res.data : u));
      setSelectedEmp(res.data);
      setIsEditMode(false);
      alert("Данные успешно сохранены!");
    } catch (err) {
      alert("Ошибка при сохранении данных.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-500 font-medium">Загрузка списка сотрудников...</div>;

  return (
    <div className="h-full flex flex-col">

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Сотрудники</h1>
        <p className="text-sm text-gray-500 mt-1">Контакты, кабинеты и рабочие статусы коллег ({filteredEmployees.length} чел.)</p>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-2.5 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Поиск по имени, фамилии или почте..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="w-full sm:w-64">
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white cursor-pointer font-medium text-gray-700"
          >
            <option value="">🏢 Все отделы</option>
            {allDepartments.map((dept, i) => (
              <option key={i} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
          {filteredEmployees.map(emp => {
            const firstName = emp.first_name || emp.username;
            const lastName = emp.last_name || '';
            const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();

            return (
              <div
                key={emp.id}
                onClick={() => handleCardClick(emp)}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between group relative"
              >
                <div>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {initials || '👤'}
                    </div>
                    <div className="truncate">
                      <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-blue-600 transition-colors truncate">
                        {firstName} {lastName}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium truncate mt-0.5">{emp.position || 'Должность не указана'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {emp.department_names?.length > 0 ? (
                      emp.department_names.map((d, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px] font-semibold truncate max-w-full">
                          🏢 {d}
                        </span>
                      ))
                    ) : <span className="text-[10px] text-gray-300 italic">Отдел не указан</span>}
                  </div>
                </div>

                <div className="space-y-1.5 pt-3 border-t border-gray-100 text-xs text-gray-600">
                  <div className="flex justify-between"><span className="text-gray-400">Кабинет:</span> <span className="font-bold text-gray-800">{emp.cabinet || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Телефон:</span> <span className="font-bold text-gray-800">{emp.phone_number || '—'}</span></div>
                  {emp.hr_note && (
                    <div className="mt-2 text-[11px] bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-100/70 truncate" title={emp.hr_note}>
                      📌 {emp.hr_note}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <span className="text-4xl block mb-2">🔍</span>
            <p className="font-medium text-sm">Сотрудники по вашему запросу не найдены</p>
          </div>
        )}
      </div>

      {/* === МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ПРОФИЛЯ === */}
      {selectedEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setSelectedEmp(null); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative animate-fade-in my-8">

            <div className="bg-slate-900 text-white p-6 sm:p-8 relative">
              <button onClick={() => setSelectedEmp(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full font-bold flex items-center justify-center transition-colors">✕</button>

              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center shadow-lg shrink-0">
                  {selectedEmp.first_name?.[0] || 'U'}{selectedEmp.last_name?.[0] || ''}
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black">{selectedEmp.first_name || selectedEmp.username} {selectedEmp.last_name || ''}</h2>
                  <p className="text-blue-400 font-bold text-sm mt-1">{selectedEmp.position || 'Сотрудник компании'}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto">

              <div className="flex justify-between items-center -mb-2">
                <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider">Основная информация</h4>
                {(isMe || isHRorBoss) && !isEditMode && (
                  <button type="button" onClick={() => setIsEditMode(true)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors flex items-center gap-1">
                    ✏️ Редактировать данные
                  </button>
                )}
              </div>

              {isEditMode ? (
                <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200">
                  {isMe && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Имя *</label><input type="text" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full p-2.5 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" required /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Фамилия</label><input type="text" value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full p-2.5 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Номер телефона</label><input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+7 (999) 000-00-00" className="w-full p-2.5 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Кабинет</label><input type="text" value={editCabinet} onChange={e => setEditCabinet(e.target.value)} className="w-full p-2.5 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>
                  )}

                  {isOnlyBoss && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Должность (Доступно руководству)</label>
                      <input type="text" value={editPosition} onChange={e => setEditPosition(e.target.value)} className="w-full p-2.5 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}

                  {isHRorBoss && (
                    <div>
                      <label className="block text-xs font-bold text-amber-800 mb-1 uppercase tracking-wide">📌 Служебная заметка / Статус (Отпуска, больничные)</label>
                      <textarea value={hrNoteText} onChange={e => setHrNoteText(e.target.value)} placeholder="Например: В отпуске до 25.07..." rows="2" className="w-full p-3 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/60">
                    <button type="button" onClick={() => setIsEditMode(false)} className="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition">Отмена</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs shadow hover:bg-blue-700 transition">
                      {saving ? "Сохранение..." : "Сохранить изменения"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ИСПРАВЛЕНИЕ: Убрали ячейку "Системная роль" */}
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 text-sm grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                    <div><span className="block text-xs text-gray-400 font-bold uppercase mb-0.5">Email</span><a href={`mailto:${selectedEmp.email}`} className="font-bold text-blue-600 hover:underline">{selectedEmp.email}</a></div>
                    <div><span className="block text-xs text-gray-400 font-bold uppercase mb-0.5">Телефон</span><span className="font-bold text-gray-800">{selectedEmp.phone_number || 'Не указан'}</span></div>
                    <div><span className="block text-xs text-gray-400 font-bold uppercase mb-0.5">Кабинет / Офис</span><span className="font-bold text-gray-800">{selectedEmp.cabinet || 'Не указан'}</span></div>
                  </div>

                  <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl">
                    <span className="block text-xs font-black text-amber-800 uppercase tracking-wider mb-2">📌 Служебная заметка / Статус</span>
                    {selectedEmp.hr_note ? (
                      <p className="text-gray-800 text-sm font-semibold whitespace-pre-wrap leading-relaxed">{selectedEmp.hr_note}</p>
                    ) : (
                      <p className="text-gray-400 text-xs italic font-medium">Дополнительных отметок (отпуска, больничные) нет.</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <h4 className="font-black text-gray-400 text-xs uppercase tracking-wider mb-2">Подразделения</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedEmp.department_names?.length > 0 ? (
                    selectedEmp.department_names.map((d, i) => (
                      <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-800 font-bold text-xs rounded-xl border border-blue-100 shadow-sm">
                        🏢 {d}
                      </span>
                    ))
                  ) : <p className="text-xs text-gray-400 italic font-medium">Сотрудник пока не распределен по отделам.</p>}
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

export default Employees;