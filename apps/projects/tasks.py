from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from .models import Task, Vacation


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
    Ежедневная задача. Ищет задачи, до дедлайна которых осталось 10, 5 или 1 день,
    а также ежедневно напоминает о просроченных задачах (если они не в отсрочке).
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

        # === НОВАЯ ЛОГИКА: Ежедневное уведомление о просрочке ===
        elif task_date < today and task.status != 'delayed':
            title = "⚠️ Задача просрочена!"
            message = f"Дедлайн по задаче «{task.title}» истек {task_date.strftime('%d.%m.%Y')}.\nПожалуйста, обновите статус, завершите её или переведите в отсрочку с указанием причины.\nПерейти к задаче: {task_url}"

            try:
                notify_user(task.assignee, title, message, link=task_link)
            except Exception as e:
                print(f"Ошибка при отправке уведомления о просрочке для задачи ID {task.id}: {e}")


@shared_task
def notify_upcoming_vacations():
    # Ровно через 10 дней от текущей секунды
    target_date = timezone.now().date() + timedelta(days=10)

    # Ищем отпуска, которые начнутся в эту дату, и о которых мы еще не писали
    vacations = Vacation.objects.filter(
        start_date=target_date,
        is_notified_10_days=False
    ).select_related('user')

    for vac in vacations:
        # ХИТРОСТЬ ПИТОНА: импортируем notify_user ПРЯМО ВНУТРИ функции,
        # чтобы обойти ошибку перекрестного импорта (Circular Import)
        from .views import notify_user

        start_formatted = vac.start_date.strftime('%d.%m.%Y')

        notify_user(
            user=vac.user,
            title="🌴 Приближается отпуск!",
            message=f"Напоминаем, что через 10 дней ({start_formatted}) у вас начинается отпуск.\nПожалуйста, подойдите в отдел кадров для подписания документов.",
            link="/profile"  # Ссылка куда перекинет клик по пушу
        )

        # Ставим клеймо, что письмо отправлено
        vac.is_notified_10_days = True
        vac.save(update_fields=['is_notified_10_days'])