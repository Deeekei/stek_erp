from rest_framework import serializers
from .models import Project, Task, Comment, Attachment, News, Notification
from django.utils import timezone


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'author', 'author_name', 'text', 'created_at']
        read_only_fields = ['author']


class AttachmentSerializer(serializers.ModelSerializer):
    # Берем имя из правильного поля uploaded_by
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)

    class Meta:
        model = Attachment
        # Строго перечисляем поля, как они названы в твоей модели (upload_at)
        fields = ['id', 'file', 'uploaded_by', 'uploaded_by_name', 'upload_at']
        read_only_fields = ['uploaded_by']


class TaskSerializer(serializers.ModelSerializer):
    comments = CommentSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    class Meta:
        model = Task
        fields = '__all__'

    def validate(self, attrs):
        current_status = self.instance.status if self.instance else 'new'
        new_status = attrs.get('status', current_status)
        plan_end_date = attrs.get('plan_end_date', self.instance.plan_end_date if self.instance else None)

        if new_status in ['completed', 'cancelled'] and plan_end_date:
            today = timezone.now().date()
            if today > plan_end_date:
                delay_reason = attrs.get('delay_reason', self.instance.delay_reason if self.instance else None)

                if not delay_reason or str(delay_reason).strip() == '':
                    raise serializers.ValidationError({"delay_reason": "Задача просрочена. Пожалуйста, укажите причину просрочки"})
        return attrs

    def update(self, instance, validated_data):
        new_status = validated_data.get('status', instance.status)

        if new_status in ['completed', 'cancelled'] and not instance.actual_end_date:
            validated_data['actual_end_date'] = timezone.now().date()

        return super().update(instance, validated_data)

class ProjectSerializer(serializers.ModelSerializer):
    is_pinned = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = Project
        fields = '__all__'

    def get_is_pinned(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Проверяем, есть ли текущий юзер в списке закрепивших
            return obj.pinned_by.filter(id=request.user.id).exists()
        return False



class NewsSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = News
        # ДОБАВЛЕНО ПОЛЕ 'image'
        fields = ['id', 'title', 'content', 'image', 'author_name', 'created_at', 'description']

    def get_author_name(self, obj):
        if obj.author:
            return f"{obj.author.first_name} {obj.author.last_name}".strip() or obj.author.username
        return "Аноним"

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'is_read', 'created_at']