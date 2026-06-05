
from django.db.models import Q
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import viewsets
from django.contrib.auth import get_user_model
from .serializers import UserSerializer
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .serializers import ChangePasswordSerializer


User = get_user_model()


class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Добавляем поиск: если в GET-запросе есть параметр ?q=...
        query = request.query_params.get('q', '')

        users = User.objects.all()
        if query:
            users = users.filter(
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query) |
                Q(username__icontains=query)
            )

        # Формируем ФИО
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
        # Зашиваем твою роль в токен!
        token['role'] = user.role
        token['username'] = user.username
        return token

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]


class ChangePasswordView(APIView):
    # Эндпоинт доступен только авторизованным пользователям
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)

        if serializer.is_valid():
            user = request.user

            # Проверяем правильность старого пароля
            if not user.check_password(serializer.data.get("old_password")):
                return Response(
                    {"error": "Неверный старый пароль."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Устанавливаем новый пароль и сохраняем
            user.set_password(serializer.data.get("new_password"))
            user.save()

            return Response(
                {"message": "Пароль успешно изменен."},
                status=status.HTTP_200_OK
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)