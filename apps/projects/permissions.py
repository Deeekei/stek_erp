from rest_framework import permissions

class IsManagerOrAdmin(permissions.BasePermission):
    """
    Универсальное разрешение для Проектов и Задач.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        # 1. Безопасные методы разрешены всем, кто прошел get_queryset
        if request.method in permissions.SAFE_METHODS:
            return True

        # 2. Полный доступ для админов и директоров
        is_admin = getattr(request.user, 'role', '') in ['admin', 'director'] or request.user.is_superuser
        if is_admin:
            return True

        # 3. Если проверяем ПРОЕКТ (у объекта есть поле owner)
        if hasattr(obj, 'owner'):
            return obj.owner == request.user

        # 4. Если проверяем ЗАДАЧУ (у объекта есть поле assignee и связь с project)
        if hasattr(obj, 'assignee') and obj.assignee == request.user:
            return True  # Исполнитель имеет право работать со своей задачей (например, менять статус или писать комменты)

        # 5. Владелец проекта имеет право управлять всеми задачами внутри своего проекта
        if hasattr(obj, 'project') and hasattr(obj.project, 'owner'):
            return obj.project.owner == request.user

        return False