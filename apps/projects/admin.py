from django.contrib import admin
from .models import Project, Task, Comment, Attachment, Department

# Базовая регистрация моделей
admin.site.register(Project)
admin.site.register(Task)
admin.site.register(Comment)
admin.site.register(Attachment)
admin.site.register(Department)