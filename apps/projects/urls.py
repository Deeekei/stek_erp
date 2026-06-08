from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, TaskViewSet
from .views import EmployeeReportView, ProjectReportView, AttachmentViewSet, NewsViewSet, NotificationViewSet


router = DefaultRouter()
router.register('tasks', TaskViewSet, basename='task')
router.register('projects', ProjectViewSet, basename='project')
router.register(r'attachments', AttachmentViewSet)
router.register(r'news', NewsViewSet, basename='news')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
    path('reports/employee/<int:user_id>/', EmployeeReportView.as_view(), name='employee_report'),
    path('reports/project/<int:project_id>/', ProjectReportView.as_view(), name='project_report'),
]