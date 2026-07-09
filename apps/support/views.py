from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import SupportModule, Ticket
from .serializers import SupportModuleSerializer, TicketSerializer

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
        serializer.save(author=self.request.user)