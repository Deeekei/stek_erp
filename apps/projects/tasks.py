from celery import shared_task
from django.core.mail import send_mail
from pyexpat.errors import messages


@shared_task
def send_notification_email(user_email, task_title):
    subject = 'Вам назначена новая задача!'
    message = f'Здравствуйте!\n\n Вы были назначены ответственным на задачу: {task_title}'
    send_mail(
        subject = subject,
        message = message,
        from_email = 'noreply@minierp.ru',
        recipient_list = [user_email],
        fail_silently = False,
    )

    return f"Уведомление отправлено пользователю на {user_email}"
