# stek_erp/Dockerfile

# Используем официальный образ Python
FROM python:3.10-slim

# Устанавливаем системные зависимости для PostgreSQL
RUN apt-get update && apt-get install -y libpq-dev gcc

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем файл зависимостей и устанавливаем их
# Убедись, что у тебя есть файл requirements.txt в корне проекта!
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь исходный код проекта в контейнер
COPY . .

# Команда для запуска production-сервера Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "Mini_ERP.wsgi:application"]