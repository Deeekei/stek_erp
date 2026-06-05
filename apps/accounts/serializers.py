from rest_framework import serializers
from django.contrib.auth import get_user_model

# Получаем твою модель пользователя (кастомную или стандартную)
User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        # Здесь мы явно перечисляем все поля, которые хотим отправить на фронтенд.
        # Обязательно убедись, что 'is_superuser' и 'can_post_news' присутствуют в списке!
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'role',
            'is_superuser',
            'can_post_news'
        ]

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)