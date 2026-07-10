from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import SupportModule, Ticket
from .serializers import SupportModuleSerializer, TicketSerializer
from apps.projects.views import notify_user

class SupportModuleViewSet(viewsets.ModelViewSet):
    queryset = SupportModule.objects.prefetch_related('assignees').all()
    serializer_class = SupportModuleSerializer
    permission_classes = [IsAuthenticated]

class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related('module', 'author').all()
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # При создании заявки автоматически привязываем текущего пользователя как автора
        ticket = serializer.save(author=self.request.user)
        if ticket.module:
            # Получаем всех ответственных за этот модуль
            assignees = ticket.module.assignees.all()

            for assignee in assignees:
                # Не отправляем уведомление самому себе (если админ сам создал тикет для своего модуля)
                if assignee != self.request.user:
                    # Ссылка на страницу заявок на фронтенде
                    ticket_link = "/tickets"
                    full_url = f"https://erp.stekufa.ru{ticket_link}"

                    author_name = self.request.user.get_full_name() or self.request.user.username

                    # Отправляем уведомление (Колокольчик + Email + Web Push)
                    notify_user(
                        user=assignee,
                        title="🆕 Новый тикет",
                        message=f"Поступила новая заявка: {ticket.title}\nМодуль: {ticket.module.name}\nАвтор: {author_name}\nСрочность: {ticket.get_urgency_display()}",
                        link=ticket_link
                    )