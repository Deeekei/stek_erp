from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

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
            fail_silently=False,  # Ошибка запишется в логи Celery, если Яндекс "упадет"
        )
        return f"Email sent to {user_email}"
    except Exception as e:
        return f"Error sending to {user_email}: {str(e)}"