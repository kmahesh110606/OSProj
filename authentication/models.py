from django.db import models
from django.contrib.auth.models import AbstractUser

# Create your models here.

class CustomUser(AbstractUser):
	email = models.EmailField(unique=True)
	phone = models.CharField(max_length=15, unique=True)

	USERNAME_FIELD = 'username'
	REQUIRED_FIELDS = ['email', 'phone']
from django.db import models

# Create your models here.
