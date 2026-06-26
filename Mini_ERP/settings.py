"""
Django settings for Mini_ERP project.
"""

from pathlib import Path
import os
import sys
from datetime import timedelta
from celery.schedules import crontab

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(BASE_DIR, 'apps'))

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-@o1_4p)s6uw-&qq=oz4hfrblr=orj+2)^jf(1k*_zgbx!n9duz'

# В продакшене (в Docker) лучше ставить DEBUG = False, но пока оставим True для отладки
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

# ИСПРАВЛЕНО: синтаксис Python требует строк в списке
ALLOWED_HOSTS = ['186.246.7.109', '127.0.0.1', 'localhost', 'erp.stekufa.ru']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'apps.accounts.apps.AccountsConfig',
    'apps.projects.apps.ProjectsConfig',
    'django_filters',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True
ROOT_URLCONF = 'Mini_ERP.urls'

CSRF_TRUSTED_ORIGINS = [
    "http://186.246.7.109:8080",
    "http://186.246.7.109",
    "https://erp.stekufa.ru"# На случай, если уберешь порт 8080
    # Если позже прикрутишь домен, обязательно добавь его сюда, например:
    # "https://erp.tvoy-domen.ru",
]

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'Mini_ERP.wsgi.application'

# Database
# ИСПРАВЛЕНО: Теперь берет настройки из Docker, с резервным вариантом для локального запуска
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'erp_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', '123'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': ['django_filters.rest_framework.DjangoFilterBackend'],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
# ДОБАВЛЕНО: Папка, куда Nginx и Docker будут собирать всю статику проекта
STATIC_ROOT = os.path.join(BASE_DIR, 'static')

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Celery & Redis
# ИСПРАВЛЕНО: Поддержка URL Redis из переменных окружения Docker
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

EMAIL_HOST = 'smtp.yandex.ru'
EMAIL_PORT = 465
EMAIL_USE_SSL = True
EMAIL_USE_TLS = False

EMAIL_HOST_USER = 'stroitekufa@yandex.com'
EMAIL_HOST_PASSWORD = 'bpbmkmjsfgoasziv'


DEFAULT_FROM_EMAIL = f'ERP <{EMAIL_HOST_USER}>'

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

AUTH_USER_MODEL = 'accounts.User'


CELERY_BEAT_SCHEDULE = {
    'check-deadlines-every-morning': {
        'task': 'apps.projects.tasks.check_deadlines_and_notify',
        'schedule': crontab(hour=7, minute=0),
    },
    'check-vacations-every-morning': {
        'task': 'apps.projects.tasks.notify_upcoming_vacations', # Укажи свой точный путь к файлу
        'schedule': crontab(hour=9, minute=0), # Запуск каждый день строго в 9:00 утра
    },
}

CELERY_TIMEZONE = 'Europe/Moscow'