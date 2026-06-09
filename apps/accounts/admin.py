from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ('Корпоративная информация', {
            'fields': ('position', 'role', 'can_post_news', 'is_blocked'),
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Корпоративная информация', {
            'fields': ('position', 'role', 'can_post_news'),
        }),
    )

    list_display = ('username', 'email', 'get_full_name', 'role', 'position', 'is_staff')
    list_filter = UserAdmin.list_filter + ('role', 'is_blocked')
    search_fields = ('username', 'first_name', 'last_name', 'email')