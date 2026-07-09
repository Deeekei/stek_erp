from django.db import models
from apps.accounts.models import User


class SupportModule(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название модуля/проекта")
    assignees = models.ManyToManyField(User, related_name='assigned_support_modules', blank=True,
                                       verbose_name="Исполнители")

    class Meta:
        verbose_name = "Модуль ПО"
        verbose_name_plural = "Модули ПО"

    def __str__(self):
        return self.name


class Ticket(models.Model):
    URGENCY_CHOICES = (
        ('normal', 'Обычная'),
        ('high', 'Срочно'),
        ('critical', 'Критическая'),
    )
    STATUS_CHOICES = (
        ('new', 'Новая'),
        ('progress', 'В работе'),
        ('closed', 'Закрыта'),
    )

    module = models.ForeignKey(SupportModule, on_delete=models.CASCADE, related_name='tickets', verbose_name="Модуль")
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_tickets',
                               verbose_name="Автор заявки")

    title = models.CharField(max_length=255, verbose_name="Заголовок")
    description = models.TextField(verbose_name="Описание проблемы")
    urgency = models.CharField(max_length=20, choices=URGENCY_CHOICES, default='normal', verbose_name="Срочность")
    anydesk = models.CharField(max_length=50, blank=True, verbose_name="AnyDesk")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Статус")

    # Скриншот (для работы потребуется настроить MEDIA_ROOT, если еще не настроен)
    screenshot = models.ImageField(upload_to='support/screenshots/%Y/%m/', null=True, blank=True,
                                   verbose_name="Скриншот ошибки")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Заявка в поддержку"
        verbose_name_plural = "Заявки в поддержку"
        ordering = ['-created_at']

    def __str__(self):
        return f"Заявка #{self.id} - {self.title}"