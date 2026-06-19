import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function TaskStandalone() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const response = await api.get(`tasks/${id}/`);
        setTask(response.data);
      } catch (err) {
        setError('Не удалось загрузить задачу. Возможно, она удалена или у вас нет доступа.');
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Загрузка задачи...</div>;

  if (error) return (
    <div className="p-8 max-w-2xl mx-auto mt-10 bg-white rounded-xl shadow-md text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <Link to="/" className="text-blue-600 hover:underline">Вернуться на главную</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 md:p-8">

        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Задача #{task.id}</span>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{task.title}</h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {task.status}
          </span>
        </div>

        <div className="prose max-w-none text-gray-600 mb-8 bg-gray-50 p-4 rounded-xl">
          {task.description ? (
            <p className="whitespace-pre-wrap">{task.description}</p>
          ) : (
            <p className="italic text-gray-400">Описание отсутствует</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Исполнитель:</p>
            <p className="font-semibold text-gray-800">
              {task.assignee_details?.first_name} {task.assignee_details?.last_name}
              {(!task.assignee_details?.first_name && task.assignee) && `ID: ${task.assignee}`}
              {!task.assignee && 'Не назначен'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Дедлайн:</p>
            <p className={`font-semibold ${task.plan_end_date ? 'text-gray-800' : 'text-gray-400'}`}>
              {task.plan_end_date ? new Date(task.plan_end_date).toLocaleDateString('ru-RU') : 'Не установлен'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default TaskStandalone;