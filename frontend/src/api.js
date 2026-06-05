import axios from 'axios';

// Создаем базовую настройку, чтобы не писать http://127.0.0.1:8000/api/ каждый раз
const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/',
});

// "Перехватчик" запросов: перед отправкой любого запроса он проверяет токен
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;