from django.contrib.auth import get_user_model
from django.db import models
from apps.accounts.models import User

class Department(models.Model):
    name = models.CharField(max_length=100, verbose_name="Название отдела")
    # Связываем с пользователями, используя related_name='departments'
    employees = models.ManyToManyField(User, blank=True, related_name='departments', verbose_name="Сотрудники отдела")

    class Meta:
        verbose_name = "Отдел"
        verbose_name_plural = "Отделы"

    def __str__(self):
        return self.name



class Project(models.Model):
    VISIBILITY_CHOICES = (
        ('all', 'Все'),
        ('department', 'Отдел'),
        ('selected', 'Выбранные люди'),
        ('only_me', 'Только я'),
    )
    STATUS_CHOICES = (
        ('planning', 'Планируется'),
        ('in_progress', 'В работе'),
        ('paused', 'На паузе'),
        ('completed', 'Завершен'),
        ('cancelled', 'Отменен'),
    )
    title = models.CharField(max_length=100, verbose_name="Название проекта")
    description = models.TextField(blank=True, verbose_name="Описание")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planning')
    manager = models.ForeignKey(User, on_delete=models.PROTECT,  related_name='managed_projects', verbose_name="Руководитель проекта")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_projects', verbose_name="Владелец", null=True)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='all', verbose_name="Видимость")
    allowed_users = models.ManyToManyField(User, blank=True, related_name='accessible_projects', verbose_name="Доступно пользователям")
    plan_start_date = models.DateField(null=True, blank=True, verbose_name="Планируемая дата начала")
    plan_end_date = models.DateField(null=True, blank=True, verbose_name="Планируемая дата окончания")
    is_archived = models.BooleanField(default=False, verbose_name="Архивный")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата изменения")

    class Meta:
        verbose_name = "Проект"
        verbose_name_plural = "Проекты"

        def __str__(self):
            return self.title


class Task(models.Model):
    STATUS_CHOICES = (
        ('new', 'Новая'),
        ('in_progress', 'В работе'),
        ('review', 'На проверке'),
        ('completed', 'Завершена'),
        ('cancelled', 'Отменена'),
    )
    PRIORITY_CHOICES = (
        ('low', 'Низкий'),
        ('medium', 'Средний'),
        ('high', 'Высокий'),
        ('critical', 'Критичный')
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks', verbose_name="Проект")
    title = models.CharField(max_length=255, verbose_name="Заголовок")
    description = models.TextField(blank=True, verbose_name="Описание")
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='assigned_tasks', verbose_name="Ответсвенный")
    participants = models.ManyToManyField(User, related_name='involved_tasks', blank=True, verbose_name='Участники')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Статус")
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium', verbose_name="Приоритет")
    plan_start_date = models.DateField(null=True, blank=True, verbose_name="Плановая дата начала")
    plan_end_date = models.DateField(verbose_name="Планируемая дата окончания")
    actual_end_date = models.DateField(null=True, blank=True, verbose_name="Фактическая дата окончания")
    estimated_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Оценка трудозатрат (ч)")
    actual_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Фактические трудозатраты (ч)")
    parent_task = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subtasks', verbose_name="Родительская задача")
    delay_reason = models.TextField(blank=True, verbose_name="Причина просрочки")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата изменения")
    dependencies = models.ManyToManyField('self', symmetrical=False, blank=True, verbose_name="Влияет на задачи")

    hidden_for = models.ManyToManyField(
        User,
        related_name='hidden_tasks',
        blank=True,
        help_text="Пользователи (участники), которые скрыли эту задачу с доски"
    )
    class Meta:
        verbose_name = "Задача"
        verbose_name_plural = "Задачи"

    def __str__(self):
        return self.title


class Comment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments', verbose_name="Задача")
    author = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='comments', verbose_name="Автор")
    text = models.TextField(verbose_name="Текст сообщения")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата и время")

    class Meta:
        verbose_name = "Комментарий"
        verbose_name_plural = "Комментарии"

    def __str__(self):
        return f"Комментарий от {self.author} к задаче {self.task}"


class Attachment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='attachments', verbose_name="Задача")

    file = models.FileField(upload_to='attachments/%Y/%m/%d/', verbose_name= "Файл")

    uploaded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, verbose_name="Кто загрузил")
    upload_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата загрузки")
    class Meta:
        verbose_name = "Вложение"
        verbose_name_plural = "Вложения"

    def __str__(self):
        return f"Файл{self.file.name} для задачи {self.task.title}"

class News(models.Model):
    title = models.CharField(max_length=255, verbose_name="Заголовок")
    content = models.TextField(verbose_name="Текст новости")
    description = models.TextField(verbose_name="Подробности о новости")
    author = models.ForeignKey(get_user_model(), on_delete=models.SET_NULL, null=True, related_name="news")
    created_at = models.DateTimeField(auto_now_add=True)
    image = models.ImageField(upload_to='news_images/', null=True, blank=True,verbose_name="Картинка")

    class Meta:
        ordering = ['-created_at']

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications', verbose_name='Кому')
    title = models.CharField(max_length=255, verbose_name='Заголовок')
    message = models.TextField(verbose_name='Сообщение')
    is_read = models.BooleanField(default=False, verbose_name='Прочитано')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Уведомление'
        verbose_name_plural = 'Уведомления'

    def __str__(self):
        return f"Уведомление для {self.user.username}: {self.title}"