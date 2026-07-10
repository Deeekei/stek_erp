from rest_framework import serializers
import os
from .models import SupportModule, Ticket, TicketAttachment

class SupportModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportModule
        fields = '__all__'

class TicketAttachmentSerializer(serializers.ModelSerializer):
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = ['id', 'file', 'file_name', 'created_at']

    def get_file_name(self, obj):
        # Отдаем красивое имя файла без длинного пути
        return os.path.basename(obj.file.name) if obj.file else "Файл"

class TicketSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source='module.name', read_only=True)
    author_name = serializers.CharField(source='author.get_full_name', read_only=True, default="Неизвестно")
    assignees = serializers.SerializerMethodField()
    # Подключаем вложения
    attachments = TicketAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = '__all__'
        read_only_fields = ('author', 'created_at', 'updated_at')

    def get_assignees(self, obj):
        if not obj.module:
            return []
        users = obj.module.assignees.all()
        return [{"id": u.id, "name": u.get_full_name() or u.username} for u in users]