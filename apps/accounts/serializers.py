from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    department_names = serializers.SerializerMethodField()
    # hr_note больше не требует отдельного метода, DRF прочитает его напрямую как текст

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'position',
            'role',
            'phone_number',
            'cabinet',
            'department_names',
            'hr_note',          # <-- Теперь это обычное публичное поле
            'is_superuser',
            'can_post_news'
        ]

    def get_department_names(self, obj):
        return [dept.name for dept in obj.departments.all()]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)