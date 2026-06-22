from django.db.models import Q
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import viewsets, status
from django.contrib.auth import get_user_model
from .serializers import UserSerializer, ChangePasswordSerializer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action


User = get_user_model()


class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '')

        users = User.objects.all()
        if query:
            users = users.filter(
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query) |
                Q(username__icontains=query)
            )

        user_list = [
            {
                'id': u.id,
                'full_name': f"{u.last_name} {u.first_name}".strip() or u.username,
                'email': u.email
            }
            for u in users
        ]
        return Response(user_list)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['username'] = user.username
        return token

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.prefetch_related('departments').all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_profile(self, request, pk=None):
        target_user = self.get_object()
        editor = request.user

        is_hr = editor.departments.filter(name__icontains='кадров').exists()
        is_boss = editor.role in ['admin', 'director'] or editor.is_superuser

        # 1. Проверка на дурака: если обычный юзер пытается лезть в чужой профиль — бьем по рукам
        if editor.id != target_user.id and not (is_boss or is_hr):
            return Response({'error': 'У вас нет прав на редактирование этого профиля'}, status=status.HTTP_403_FORBIDDEN)

        # 2. Формируем "белый список" разрешенных полей для этого запроса
        allowed_fields = []

        # Свои личные данные может менять каждый (при условии, что правит сам себя)
        if editor.id == target_user.id:
            allowed_fields.extend(['first_name', 'last_name', 'phone_number', 'cabinet'])

        # Служебную заметку могут менять HR и Боссы (и себе, и другим)
        if is_boss or is_hr:
            allowed_fields.append('hr_note')

        # Системную должность могут менять только Боссы
        if is_boss:
            allowed_fields.append('position')

        # 3. Применяем только те данные, которые прошли белый список
        for field in allowed_fields:
            if field in request.data:
                setattr(target_user, field, request.data[field])

        target_user.save()
        return Response(self.get_serializer(target_user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)

        if serializer.is_valid():
            user = request.user

            if not user.check_password(serializer.data.get("old_password")):
                return Response(
                    {"error": "Неверный старый пароль."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user.set_password(serializer.data.get("new_password"))
            user.save()

            return Response(
                {"message": "Пароль успешно изменен."},
                status=status.HTTP_200_OK
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)