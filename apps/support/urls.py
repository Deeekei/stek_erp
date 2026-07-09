from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SupportModuleViewSet, TicketViewSet

router = DefaultRouter()
router.register(r'modules', SupportModuleViewSet, basename='support-module')
router.register(r'tickets', TicketViewSet, basename='support-ticket')

urlpatterns = [
    path('', include(router.urls)),
]