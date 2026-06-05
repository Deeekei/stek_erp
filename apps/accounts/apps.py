from django.apps import AppConfig

class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    # Указываем полный путь до приложения
    name = 'apps.accounts'
    # Это имя будет красиво отображаться в админке
    verbose_name = 'Пользователи'