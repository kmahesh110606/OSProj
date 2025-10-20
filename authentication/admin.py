from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
	list_display = ("username", "email", "phone", "is_staff", "is_superuser")
	search_fields = ("username", "email", "phone")
	ordering = ("username",)

	# Show phone in the change form
	fieldsets = UserAdmin.fieldsets + (
		("Additional info", {"fields": ("phone",)}),
	)

	# Include phone in the add form
	add_fieldsets = UserAdmin.add_fieldsets + (
		(None, {"classes": ("wide",), "fields": ("phone",)}),
	)

	# Fields editable in admin list (optional, keep minimal to avoid mistakes)
	list_editable = ()
