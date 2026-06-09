from django.contrib.auth.models import AbstractUser
from django.db import models

class Department(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название отдела", unique=True)
    description = models.TextField(blank=True, verbose_name="Описание отдела")

    class Meta:
        verbose_name = "Отдел"
        verbose_name_plural = "Отделы"

    def __str__(self):
        return self.name



class User(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Администратор'),
        ('manager', 'Руководитель проекта'),
        ('executor', 'Исполнитель'),
        ('observer', 'Наблюдатель'),
        ('director', 'Директор'),
    )

    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    position = models.CharField(max_length=150, blank=True, verbose_name="Должность")
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='executor')
    is_blocked = models.BooleanField(default=False)
    can_post_news = models.BooleanField(default=False, verbose_name="Может писать новости")

    groups = models.ManyToManyField(
        'auth.Group',
        verbose_name='groups',
        blank=True,
        help_text='The groups this user belongs to.',
        related_name="custom_user_groups"
    )

    user_permissions = models.ManyToManyField(
        'auth.Permission',
        verbose_name='user permissions',
        blank=True,
        help_text='Specific permissions for this user.',
        related_name="custom_user_permissions"
    )

    departments = models.ManyToManyField(
        Department,
        blank=True,
        related_name='users',
        verbose_name="Отделы"
    )

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"

    def __str__(self):
        return f"{self.get_full_name()} ({self.get_role_display()})"


