import axios from 'axios';

// Создаем базовую настройку
const api = axios.create({
  baseURL: '/api/',
});

// 1. Перехватчик ЗАПРОСОВ (твой оригинальный код)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 2. НОВЫЙ Перехватчик ОТВЕТОВ: ловит 401 и обновляет токен
api.interceptors.response.use(
  (response) => {
    // Если запрос прошел успешно, просто возвращаем ответ
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Если ошибка 401 (Unauthorized), токен протух, и мы еще не пытались его обновить
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Достаем длинный Refresh-токен из памяти
        const refreshToken = localStorage.getItem('refresh_token');

        if (!refreshToken) {
          throw new Error('Refresh token отсутствует');
        }

        // Стучимся в DRF simplejwt за новым Access-токеном
        // Используем стандартный axios (не api), чтобы не зациклить перехватчики
        const response = await axios.post('/api/token/refresh/', {
          refresh: refreshToken,
        });

        // Бэкенд выдал новый токен — сохраняем его
        localStorage.setItem('token', response.data.access);

        // Подменяем старый токен в провалившемся запросе на новый
        originalRequest.headers.Authorization = `Bearer ${response.data.access}`;

        // Повторяем тот самый запрос (например, за уведомлениями)
        return api(originalRequest);

      } catch (refreshError) {
        // Если Refresh-токен тоже протух, полностью очищаем память
        console.error('Сессия истекла. Требуется повторный вход.');
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login'; // Принудительно выкидываем на страницу логина

        return Promise.reject(refreshError);
      }
    }

    // Если это любая другая ошибка (не 401), просто пробрасываем её дальше
    return Promise.reject(error);
  }
);

export default api;