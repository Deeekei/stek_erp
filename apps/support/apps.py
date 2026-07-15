from django.apps import AppConfig

class SupportConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.support'  # Это должно совпадать с тем, что в INSTALLED_APPS