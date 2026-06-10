from .tasks import send_notification_email

def notify_user(user, title, message):
    """
    Безопасная обертка для отправки уведомления.
    Проверяет наличие email у пользователя и пинает Celery.
    """
    if user and getattr(user, 'email', None):
        # Вызываем задачу Celery асинхронно через .delay()
        send_notification_email.delay(user.email, title, message)