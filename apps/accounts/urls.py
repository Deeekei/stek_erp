from django.urls import path, include
from rest_framework.routers import DefaultRouter

# Не забудь добавить ChangePasswordView в импорт из .views
from .views import UserListView, UserViewSet, ChangePasswordView

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    # ВАЖНО: Ставим кастомный путь ДО роутера, чтобы он перехватывал запрос первым!
    path('users/change_password/', ChangePasswordView.as_view(), name='change_password'),

    # Подключаем все пути, которые автоматически сгенерировал роутер
    path('', include(router.urls)),

    # Старый путь мы комментируем, чтобы он не перехватывал запросы на /users/
    # path('users-old/', UserListView.as_view(), name='user-list'),
]