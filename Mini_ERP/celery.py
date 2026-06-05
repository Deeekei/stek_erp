import os
from celery import Celery

os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE',
    'Mini_ERP.settings'
    )
app = Celery('Mini_ERP')

app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()