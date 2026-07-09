from rest_framework import serializers
from .models import SupportModule, Ticket

class SupportModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportModule
        fields = '__all__'

class TicketSerializer(serializers.ModelSerializer):
    # Дополнительные поля для удобного отображения на фронтенде
    module_name = serializers.CharField(source='module.name', read_only=True)
    author_name = serializers.CharField(source='author.get_full_name', read_only=True, default="Неизвестно")
    assignees = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = '__all__'
        read_only_fields = ('author', 'created_at', 'updated_at')

    def get_assignees(self, obj):
        # Отдаем фронтенду массив исполнителей для конкретной заявки
        users = obj.module.assignees.all()
        return [{"id": u.id, "name": u.get_full_name() or u.username} for u in users]