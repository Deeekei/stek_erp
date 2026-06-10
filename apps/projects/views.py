from rest_framework import viewsets, status
from .models import Project, Task, Notification
from .serializers import ProjectSerializer, TaskSerializer, CommentSerializer, NotificationSerializer
from rest_framework.decorators import action
from rest_framework.response import Response
from .services import shift_task_deadlines, generate_employee_excel
from apps.accounts.models import User
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from .permissions import IsManagerOrAdmin
from rest_framework.views import APIView
from django.db.models import Count, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from .tasks import send_notification_email
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions
from .models import Attachment, News
from .serializers import AttachmentSerializer, NewsSerializer
import xml.etree.ElementTree as ET
import csv
import io
import re
from datetime import datetime, timedelta, date
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied


User = get_user_model()


def notify_user(user, title, message):
    """
    Создает уведомление в БД и отправляет Email.
    """
    if not user:
        return

    # 1. Создаем запись для интерфейса (колокольчика)
    Notification.objects.create(
        user=user,
        title=title,
        message=message
    )

    # 2. Отправляем письмо через Celery (упадет в консоль, так как у нас console backend)
    try:
        send_notification_email.delay(user.email, title, message)
    except Exception as e:
        print(f"Ошибка отправки Email через Celery: {e}")

class DashboardOverduePagination(PageNumberPagination):
    page_size = 10  # Ровно 10 задач на страницу
    page_size_query_param = 'page_size'

def calculate_finish_date(start_date_str, duration_str):
    """
    Высчитывает дату дедлайна на основе даты начала и длительности MS Project.
    Пропускает выходные дни (субботу и воскресенье).
    """
    if not start_date_str or not duration_str or not duration_str.startswith('PT'):
        return start_date_str

    try:
        start_dt = datetime.strptime(start_date_str, '%Y-%m-%d')

        # Ищем часы и минуты с помощью регулярных выражений
        h_match = re.search(r'(\d+)H', duration_str)
        m_match = re.search(r'(\d+)M', duration_str)

        hours = int(h_match.group(1)) if h_match else 0
        minutes = int(m_match.group(1)) if m_match else 0

        # Переводим в рабочие дни (1 стандартный день = 8 часов)
        working_days = int((hours + (minutes / 60)) / 8)

        current_date = start_dt
        # Прибавляем дни, пропуская выходные (5 = суббота, 6 = воскресенье)
        while working_days > 0:
            current_date += timedelta(days=1)
            if current_date.weekday() < 5:
                working_days -= 1

        return current_date.strftime('%Y-%m-%d')
    except Exception:
        return start_date_str

class CanEditTaskPermission(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        # 1. Чтение задачи разрешено всем
        if request.method in permissions.SAFE_METHODS:
            return True

        # 2. ИСКЛЮЧЕНИЕ: Участники могут оставлять комментарии И скрывать задачу со своей доски
        if view.action in ['add_comment', 'hide']:
            return True

        # === НИЖЕ ИДУТ ПРАВИЛА ДЛЯ РЕДАКТИРОВАНИЯ САМОЙ ЗАДАЧИ ===
        if getattr(request.user, 'role', '') in ['admin', 'director'] or request.user.is_superuser:
            return True

        if obj.project and obj.project.manager == request.user:
            return True

        if obj.assignee == request.user:
            return True

        return False

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def perform_create(self, serializer):
        # Автоматически делаем текущего пользователя создателем/владельцем проекта
        serializer.save(owner=self.request.user)

    def get_queryset(self):
        user = self.request.user

        # Директора и Админы видят ВСЕ проекты (включая Приватные)
        if user.role in ['admin',] or user.is_superuser:
            return Project.objects.all().distinct()

        # Для остальных собираем по правилам
        return Project.objects.filter(
            Q(owner=user) |  # Создатель
            Q(manager=user) |  # Ответственный за проект
            Q(visibility='all') |  # Видят все
            Q(visibility='department', owner__departments__in=user.departments.all()) |  # Отдел
            Q(visibility='selected', allowed_users=user)  # Несколько (добавленные пользователи)
        ).distinct()

    @action(detail=True, methods=['post'])
    def import_xml(self, request, pk=None):
        project_instance = self.get_object()
        xml_file = request.FILES.get('file')

        if not xml_file:
            return Response({"error": "Файл не предоставлен"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tree = ET.parse(xml_file)
            root = tree.getroot()
            ns = {'ns': root.tag.split('}')[0].strip('{')} if '}' in root.tag else {}
            prefix = 'ns:' if ns else ''

            wbs_to_task = {}  # Память для иерархии по коду WBS
            level_to_task = {}  # Резервная память для иерархии по уровню
            uid_to_task = {}  # Память для связей по UID
            tasks_with_dependencies = []
            created_count = 0

            # === ЭТАП 1: СОЗДАНИЕ ВСЕХ ЗАДАЧ ===
            for task_elem in root.findall(f'.//{prefix}Task', ns):
                task_id_elem = task_elem.find(f'{prefix}ID', ns)
                if task_id_elem is None or task_id_elem.text == '0':
                    continue

                name_elem = task_elem.find(f'{prefix}Name', ns)
                if name_elem is None or not name_elem.text:
                    continue

                name = name_elem.text

                uid_elem = task_elem.find(f'{prefix}UID', ns)
                task_uid = uid_elem.text if uid_elem is not None else None

                wbs_elem = task_elem.find(f'{prefix}WBS', ns)
                wbs = wbs_elem.text if wbs_elem is not None else None

                outline_level_elem = task_elem.find(f'{prefix}OutlineLevel', ns)
                outline_level = int(outline_level_elem.text) if outline_level_elem is not None else 1

                start_elem = task_elem.find(f'{prefix}Start', ns)
                finish_elem = task_elem.find(f'{prefix}Finish', ns)
                duration_elem = task_elem.find(f'{prefix}Duration', ns)
                notes_elem = task_elem.find(f'{prefix}Notes', ns)

                start_text = start_elem.text if start_elem is not None else None
                finish_text = finish_elem.text if finish_elem is not None else None
                duration_text = duration_elem.text if duration_elem is not None else None

                start_date = start_text.split('T')[0] if start_text else None
                finish_date = finish_text.split('T')[0] if finish_text else None

                # --- УМНЫЙ РАСЧЕТ ДАТ ---
                if not finish_date and start_date and duration_text:
                    finish_date = calculate_finish_date(start_date, duration_text)
                elif not finish_date and start_date:
                    finish_date = start_date
                elif not start_date and finish_date:
                    start_date = finish_date
                elif not start_date and not finish_date:
                    today_str = date.today().strftime('%Y-%m-%d')
                    start_date = today_str
                    finish_date = today_str

                description = notes_elem.text if notes_elem is not None else 'Импортировано из MS Project'

                # --- ДВОЙНАЯ ПОДСТРАХОВКА ИЕРАРХИИ ---
                parent_task = None
                if wbs and '.' in wbs:
                    parent_wbs = wbs.rsplit('.', 1)[0]
                    parent_task = wbs_to_task.get(parent_wbs)
                if not parent_task:
                    parent_task = level_to_task.get(outline_level - 1)

                new_task = Task.objects.create(
                    project=project_instance,
                    title=name,
                    description=description,
                    plan_start_date=start_date,
                    plan_end_date=finish_date,
                    status='new',
                    priority='medium',
                    assignee=request.user,
                    parent_task=parent_task
                )
                created_count += 1

                if wbs:
                    wbs_to_task[wbs] = new_task
                if task_uid:
                    uid_to_task[task_uid] = new_task

                level_to_task[outline_level] = new_task
                keys_to_delete = [k for k in level_to_task.keys() if k > outline_level]
                for k in keys_to_delete:
                    del level_to_task[k]

                # --- СЧИТЫВАЕМ СВЯЗИ ---
                predecessor_uids = []
                for link in task_elem.findall(f'{prefix}PredecessorLink', ns):
                    pred_uid_elem = link.find(f'{prefix}PredecessorUID', ns)
                    if pred_uid_elem is not None and pred_uid_elem.text:
                        predecessor_uids.append(pred_uid_elem.text)

                if predecessor_uids:
                    tasks_with_dependencies.append((new_task, predecessor_uids))

            # === ЭТАП 2: ПРОСТАВЛЯЕМ СВЯЗИ В БД ===
            for task_obj, pred_uids in tasks_with_dependencies:
                for p_uid in pred_uids:
                    parent_dependency = uid_to_task.get(p_uid)
                    if parent_dependency:
                        task_obj.dependencies.add(parent_dependency)

            return Response({"message": f"Успешно импортировано {created_count} задач со связями и вложенностью!"},
                            status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": f"Ошибка парсинга XML: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ==========================================
    # 2. ИМПОРТ ИЗ GANTT PRO (CSV)
    # ==========================================
    @action(detail=True, methods=['post'])
    def import_csv(self, request, pk=None):
        project_instance = self.get_object()
        csv_file = request.FILES.get('file')

        if not csv_file:
            return Response({"error": "Файл не предоставлен"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            file_bytes = csv_file.read()
            try:
                decoded_file = file_bytes.decode('utf-8-sig')
            except UnicodeDecodeError:
                decoded_file = file_bytes.decode('windows-1251')

            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string, delimiter=',')

            for _ in range(4):  # Пропускаем 4 мусорные строки GanttPRO
                next(reader, None)

            headers = next(reader, None)
            if not headers:
                return Response({"error": "Не удалось прочитать заголовки CSV"}, status=status.HTTP_400_BAD_REQUEST)

            try:
                name_idx = headers.index('Наименование задач')
                start_idx = headers.index('Дата начала')
                end_idx = headers.index('Дата окончания')
                desc_idx = headers.index('Описание задачи')
                level_idx = headers.index('Уровень')
            except ValueError as e:
                return Response({"error": f"Не найдена колонка: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

            level_to_task = {}
            created_count = 0

            for row in reader:
                if not row or len(row) <= max(name_idx, level_idx):
                    continue

                name = row[name_idx].strip()
                if not name:
                    continue

                try:
                    outline_level = int(row[level_idx].strip())
                except ValueError:
                    outline_level = 1

                start_str = row[start_idx].strip()
                end_str = row[end_idx].strip()

                start_date = start_str if start_str else None
                finish_date = end_str if end_str else None

                # --- УМНАЯ ПОДСТРАХОВКА ДЛЯ ДАТ ---
                if not finish_date and start_date:
                    finish_date = start_date
                elif not start_date and finish_date:
                    start_date = finish_date
                elif not start_date and not finish_date:
                    today_str = date.today().strftime('%Y-%m-%d')
                    start_date = today_str
                    finish_date = today_str

                description = row[desc_idx].strip() if len(row) > desc_idx else 'Импортировано из GanttPRO'
                parent_task = level_to_task.get(outline_level - 1)

                new_task = Task.objects.create(
                    project=project_instance,
                    title=name,
                    description=description,
                    plan_start_date=start_date,
                    plan_end_date=finish_date,
                    status='new',
                    priority='medium',
                    assignee=request.user,
                    parent_task=parent_task
                )
                created_count += 1

                level_to_task[outline_level] = new_task
                keys_to_delete = [k for k in level_to_task.keys() if k > outline_level]
                for k in keys_to_delete:
                    del level_to_task[k]

            return Response({"message": f"Успешно импортировано {created_count} задач!"},
                            status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": f"Ошибка обработки CSV: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    # Пермишены оставляем твои, но главная "магия" защиты будет в методе update
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, CanEditTaskPermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project']

    def get_queryset(self):
        user = self.request.user

        # ОПТИМИЗАЦИЯ БД 2: Убиваем N+1 запросы для задач
        queryset = Task.objects.select_related(
            'project', 'assignee', 'parent_task'
        ).prefetch_related(
            'comments', 'attachments', 'dependencies', 'participants', 'hidden_for'
        )

        # 1. Фильтр по проекту (для страницы внутри конкретного проекта)
        project_id = self.request.query_params.get('project')
        if project_id:
            # ИСПРАВЛЕНО: Здесь фильтруем именно по ID проекта!
            queryset = queryset.filter(project_id=project_id)

        # 2. ФИЛЬТР: Только "Мои задачи" (Исполнитель ИЛИ Участник)
        assigned_to_me = self.request.query_params.get('assigned_to_me')
        if assigned_to_me == 'true':
            # ИСПРАВЛЕНО: Вот здесь должны быть Q-объекты!
            queryset = queryset.filter(Q(assignee=user) | Q(participants=user)).distinct()

        # 3. НОВЫЙ ФИЛЬТР: Исключаем задачи, которые участник "смахнул" со своей доски
        if user.is_authenticated:
            queryset = queryset.exclude(hidden_for=user)

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        """ Триггер 1: Создание новой задачи """
        task = serializer.save()

        # Если задаче назначен исполнитель, и это не тот человек, который её создал
        if task.assignee and task.assignee != self.request.user:
            notify_user(
                user=task.assignee,
                title="Новая задача",
                message=f"Вы назначены исполнителем новой задачи: {task.title}."
            )

    # ==========================================
    # НОВЫЙ БЛОК: Логика взаимодействия с задачей
    # ==========================================

    @action(detail=True, methods=['post'])
    def hide(self, request, pk=None):
        """
        Эндпоинт для скрытия задачи.
        Вызывается фронтендом, когда УЧАСТНИК (не исполнитель) перетаскивает карточку в канбане.
        """
        task = self.get_object()
        task.hidden_for.add(request.user)
        return Response({'detail': 'Задача успешно скрыта с вашей доски'}, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        """
        Перехватываем сохранение задачи и жестко проверяем права на уровне полей.
        """
        task = self.get_object()
        user = request.user
        project = task.project

        # Вычисляем, имеет ли текущий юзер права БОССА для данного проекта
        is_boss = (
                user.role in ['admin', 'director'] or
                user.is_superuser or
                user == project.owner or
                user == project.manager or
                (project.visibility == 'selected' and project.allowed_users.filter(id=user.id).exists())
        )

        # Если пользователь НЕ босс
        if not is_boss:
            if user == task.assignee:
                # Если это ИСПОЛНИТЕЛЬ: Оставляем в запросе только разрешенные поля.
                # Все попытки изменить сроки, название или приоритет будут просто проигнорированы.
                allowed_keys = ['status', 'delay_reason', 'actual_end_date']

                if isinstance(request.data, dict):
                    # Если данные пришли как обычный JSON
                    request.data = {k: v for k, v in request.data.items() if k in allowed_keys}
                else:
                    # Если данные пришли как FormData (QueryDict, он по умолчанию иммутабельный)
                    request.data._mutable = True
                    for key in list(request.data.keys()):
                        if key not in allowed_keys:
                            request.data.pop(key)
                    request.data._mutable = False
            else:
                # Если это просто участник (или вообще левый юзер) — запрещаем редактирование тела задачи.
                # Комментарии и файлы работают через другие эндпоинты, так что они не пострадают.
                return Response(
                    {'detail': 'У вас нет прав на редактирование параметров этой задачи.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        """ Триггер 2: Обновление задачи (смена статуса/сроков) """
        old_task = self.get_object()
        old_status = old_task.status
        old_assignee = old_task.assignee

        task = serializer.save()

        if old_status != task.status:
            if task.status == 'completed' and task.project.manager:
                notify_user(
                    user=task.project.manager,
                    title="Задача завершена",
                    message=f"Задача '{task.title}' была завершена исполнителем."
                )

            if task.assignee and self.request.user != task.assignee:
                notify_user(
                    user=task.assignee,
                    title="Статус задачи изменен",
                    message=f"Статус вашей задачи '{task.title}' изменен на '{task.get_status_display()}'."
                )

        if old_assignee != task.assignee and task.assignee:
            if task.assignee != self.request.user:
                notify_user(
                    user=task.assignee,
                    title="Новое назначение",
                    message=f"Вы были назначены ответственным за задачу: {task.title}.")

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def dashboard_metrics(self, request):
        """Возвращает только цифры (статистику) для графиков за 2 миллисекунды."""
        user = request.user
        today = date.today()

        metrics = Task.objects.filter(assignee=user).aggregate(
            total=Count('id'),
            new_tasks=Count('id', filter=Q(status='new')),
            in_progress=Count('id', filter=Q(status='in_progress')),
            completed=Count('id', filter=Q(status='completed')),
            overdue_count=Count('id', filter=Q(plan_end_date__lt=today) & ~Q(status='completed'))
        )
        return Response(metrics)

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Возвращает просроченные задачи пачками по 10 штук."""
        user = request.user
        today = date.today()

        qs = Task.objects.filter(
            assignee=user,
            plan_end_date__lt=today
        ).exclude(status='completed').select_related(
            'project', 'assignee'
        ).order_by('plan_end_date')

        paginator = DashboardOverduePagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = self.get_serializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=['post'])
    def shift_deadlines(self, request, pk=None):
        task = self.get_object()

        days_delta = request.data.get('days', 0)
        cascade = request.data.get('cascade', True)

        try:
            days_delta = int(days_delta)
        except ValueError:
            return Response({"error": "Поле days должно быть целым числом"}, status=status.HTTP_400_BAD_REQUEST)

        shift_task_deadlines(task=task, days_delta=days_delta, cascade=cascade)

        task.refresh_from_db()
        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def add_comment(self, request, pk=None):
        """ Триггер 3: Новый комментарий """
        task = self.get_object()
        serializer = CommentSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(task=task, author=request.user)

            if task.assignee and task.assignee != request.user:
                author_name = request.user.get_full_name() or request.user.username
                notify_user(
                    user=task.assignee,
                    title="Новый комментарий",
                    message=f"В вашей задаче '{task.title}' появился новый комментарий от {author_name}."
                )

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_files(self, request, pk=None):
        task = self.get_object()
        if 'file' not in request.FILES:
            return Response({"error": "Файл не найден"}, status=status.HTTP_400_BAD_REQUEST)
        file_obj = request.FILES['file']

        attachment = Attachment.objects.create(
            task=task,
            file=file_obj,
            uploaded_by=request.user,
        )
        serializer = AttachmentSerializer(attachment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class AttachmentViewSet(viewsets.ModelViewSet):
    queryset = Attachment.objects.all()
    serializer_class = AttachmentSerializer


class EmployeeReportView(APIView):
    def get(self, request, user_id):
        try:
            employee = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "Сотрудник не найден"}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()

        stats = Task.objects.filter(assignee=employee).aggregate(
            total_tasks=Count('id'),
            completed_tasks=Count('id', filter=Q(status='completed')),
            overdue_tasks=Count('id', filter=~Q(status='completed') & Q(plan_end_date__lt=today)),
            in_progress_tasks=Count('id', filter=Q(status='in_progress'))
        )

        if request.query_params.get('export') == 'excel':
            excel_file = generate_employee_excel(employee, stats)

            response = HttpResponse(
                excel_file.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )

            filename = f"report_employee_{employee.id}.xlsx"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            return response

        report_data = {
            "employee_id": employee.id,
            "employee_name": employee.get_full_name(),
            "position": employee.position,
            "statistics": {
                "total": stats['total_tasks'],
                "completed": stats['completed_tasks'],
                "in_progress": stats['in_progress_tasks'],
                "overdue": stats['overdue_tasks'],
            }
        }
        return Response(report_data, status=status.HTTP_200_OK)

class ProjectReportView(APIView):
    def get(self, request, project_id):
        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return Response({"error": "Проект не найден"}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()
        tasks = project.tasks.all()

        project_stats = tasks.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            in_progress=Count('id', filter=Q(status='in_progress')),
            overdue=Count('id', filter=~Q(status='completed') & Q(plan_end_date__lt=today))
        )

        employee_stats = tasks.values(
            'assignee__id',
            'assignee__first_name',
            'assignee__last_name'
        ).annotate(
            total_tasks=Count('id'),
            overdue_tasks=Count('id', filter=~Q(status='completed') & Q(plan_end_date__lt=today))
        )

        employees_data = []
        for emp in employee_stats:
            if emp['assignee__id']:
                name = f"{emp['assignee__first_name']} {emp['assignee__last_name']}".strip()
                if not name:
                    name = f"Пользователь ID {emp['assignee__id']}"
            else:
                name = "Не назначен"

            employees_data.append({
                "employee_id": emp['assignee__id'],
                "name": name,
                "total_tasks": emp['total_tasks'],
                "overdue_tasks": emp['overdue_tasks']
            })

        report_data = {
            "project_id": project.id,
            "project_title": project.title,
            "project_status": project.get_status_display(),
            "overall_statistics": project_stats,
            "employees_breakdown": employees_data
        }

        return Response(report_data, status=status.HTTP_200_OK)

class NewsPagination(PageNumberPagination):
    page_size = 3

class NewsViewSet(viewsets.ModelViewSet):
    queryset = News.objects.all()
    serializer_class = NewsSerializer
    pagination_class = NewsPagination
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role in ['admin', 'director'] or user.is_superuser or getattr(user, 'can_post_news', False):
            serializer.save(author=user)
        else:
            raise PermissionDenied("У вас нет прав публиковать новости.")

    def destroy(self, request, *args, **kwargs):
        user = request.user
        if user.role in ['admin', 'director'] or user.is_superuser or getattr(user, 'can_post_news', False):
            return super().destroy(request, *args, **kwargs)
        raise PermissionDenied("У вас нет прав удалять новости.")


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({'status': 'Уведомление прочитано'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        updated_count = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'status': f'{updated_count} уведомлений прочитано'}, status=status.HTTP_200_OK)