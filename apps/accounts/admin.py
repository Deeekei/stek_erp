from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Department


# 1. Регистрируем модель Отделов
@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)


# 2. Настраиваем и регистрируем модель Пользователя
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    # Добавляем наши кастомные поля в карточку редактирования пользователя
    fieldsets = UserAdmin.fieldsets + (
        ('Корпоративная информация', {
            'fields': ('position', 'role', 'departments', 'can_post_news', 'is_blocked'),
        }),
    )

    # Чтобы поля появлялись и при создании НОВОГО пользователя через админку
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Корпоративная информация', {
            'fields': ('position', 'role', 'departments', 'can_post_news'),
        }),
    )

    # Настраиваем, какие колонки будут видны в общем списке пользователей
    list_display = ('username', 'email', 'get_full_name', 'role', 'position', 'is_staff')

    # Добавляем удобные фильтры в правую панель
    list_filter = UserAdmin.list_filter + ('role', 'departments', 'is_blocked')

    # Поиск по имени и email
    search_fields = ('username', 'first_name', 'last_name', 'email')

    # Это нужно для красивого выбора отделов (удерживай Ctrl/Cmd для выделения нескольких)
    filter_horizontal = ('departments', 'groups', 'user_permissions')