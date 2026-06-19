from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from .models import Task


@shared_task
def send_notification_email(user_email, title, message):
    """
    Фоновая задача Celery для отправки почты.
    """
    try:
        subject = f"ERP: {title}"
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user_email],
            fail_silently=False,
        )
        return f"Email sent to {user_email}"
    except Exception as e:
        return f"Error sending to {user_email}: {str(e)}"


@shared_task
def check_deadlines_and_notify():
    """
    Ежедневная задача. Ищет задачи, до дедлайна которых осталось 10, 5 или 1 день.
    """
    from .views import notify_user

    today = timezone.now().date()

    date_in_10_days = today + timedelta(days=10)
    date_in_5_days = today + timedelta(days=5)
    date_in_1_days = today + timedelta(days=1)

    active_tasks = Task.objects.exclude(status='completed')

    for task in active_tasks:
        if not task.plan_end_date or not task.assignee:
            continue

        task_date = task.plan_end_date

        # Разделяем на относительную ссылку (для React/Firebase) и абсолютную (для Email текста)
        task_link = f"/task/{task.id}"
        task_url = f"https://erp.stekufa.ru{task_link}"

        days_left = None
        if task_date == date_in_10_days:
            days_left = 10
        elif task_date == date_in_5_days:
            days_left = 5
        elif task_date == date_in_1_days:
            days_left = 1

        if days_left:
            title = "⏳ Приближается дедлайн!"
            message = f"По задаче «{task.title}» истекает срок через {days_left} дн. (Дата: {task_date.strftime('%d.%m.%Y')})\nПерейти к задаче: {task_url}"

            try:
                # ВАЖНО: Передаем параметр link=task_link, чтобы Firebase сделал пуш кликабельным!
                notify_user(task.assignee, title, message, link=task_link)
            except Exception as e:
                print(f"Ошибка при отправке авто-уведомления для задачи ID {task.id}: {e}")