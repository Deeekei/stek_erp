from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from apps.projects.views import notify_user
from .models import SupportModule, Ticket, TicketAttachment
from .serializers import SupportModuleSerializer, TicketSerializer

class SupportModuleViewSet(viewsets.ModelViewSet):
    queryset = SupportModule.objects.prefetch_related('assignees').all()
    serializer_class = SupportModuleSerializer
    permission_classes = [IsAuthenticated]

class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related('module', 'author').prefetch_related('attachments').all()
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Сохраняем тикет
        ticket = serializer.save(author=request.user)

        # Ловим все переданные файлы
        files = request.FILES.getlist('attachments')
        for f in files:
            TicketAttachment.objects.create(ticket=ticket, file=f)

        # Отправляем уведомления
        if ticket.module:
            assignees = ticket.module.assignees.all()
            for assignee in assignees:
                if assignee != request.user:
                    ticket_link = "/tickets"
                    author_name = request.user.get_full_name() or request.user.username
                    notify_user(
                        user=assignee,
                        title="🆕 Новая заявка ПО",
                        message=f"Поступила новая заявка: {ticket.title}\nМодуль: {ticket.module.name}\nАвтор: {author_name}\nСрочность: {ticket.get_urgency_display()}",
                        link=ticket_link
                    )

        # Возвращаем обновленный тикет (уже с файлами)
        result_serializer = self.get_serializer(ticket)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'delete_file/(?P<file_id>\d+)')
    def delete_file(self, request, pk=None, file_id=None):
        """ Удаление конкретного файла из заявки """
        ticket = self.get_object()
        try:
            attachment = ticket.attachments.get(id=file_id)
            attachment.delete()
            return Response({"status": "Удалено"}, status=status.HTTP_204_NO_CONTENT)
        except TicketAttachment.DoesNotExist:
            return Response({"error": "Файл не найден"}, status=status.HTTP_404_NOT_FOUND)