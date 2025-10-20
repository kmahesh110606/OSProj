from django.contrib import admin
from .models import App, UserState, Note


@admin.register(App)
class AppAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "kind", "is_enabled", "is_pinned", "use_proxy")
    list_filter = ("kind", "is_enabled", "is_pinned", "use_proxy")
    search_fields = ("name", "slug")


@admin.register(UserState)
class UserStateAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at")
    search_fields = ("user__username", "user__email")


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "updated_at")
    search_fields = ("title", "user__username")
