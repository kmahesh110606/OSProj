from django.conf import settings
from django.db import models


class App(models.Model):
    """Registry of available apps in the Web-OS.

    Built-in apps have kind='builtin' and a slug like 'calculator' or 'notepad'.
    External apps have kind='pwa' and a launch_url.
    """
    KIND_CHOICES = (
        ("builtin", "Built-in"),
        ("pwa", "PWA"),
    )

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="builtin")
    icon = models.CharField(max_length=255, blank=True, help_text="CSS class or URL for icon")
    launch_url = models.URLField(blank=True, null=True, help_text="Used when kind=pwa")
    is_pinned = models.BooleanField(default=False, help_text="Show in Start by default")
    is_enabled = models.BooleanField(default=True)
    use_proxy = models.BooleanField(default=False, help_text="Route through server proxy to embed if site blocks iframes")
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_apps')

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class UserState(models.Model):
    """Stores per-user OS session state (open windows, positions, pinned apps, etc.)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    state_json = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):  # pragma: no cover
        return f"State({self.user})"


class Note(models.Model):
    """Simple persisted notes for the Notepad built-in app."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200, default="Untitled")
    content = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):  # pragma: no cover
        return f"{self.title} ({self.user})"


class UserFile(models.Model):
    """Very simple per-user virtual filesystem entry."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    path = models.CharField(max_length=512)  # e.g., /, /Docs, /Docs/file.txt
    is_dir = models.BooleanField(default=False)
    content = models.TextField(blank=True, default="")  # only for files
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "path")
        ordering = ["path"]

    def __str__(self):  # pragma: no cover
        return f"{self.path} ({'dir' if self.is_dir else 'file'})"


class SharedDrop(models.Model):
    """Share bucket for a user, addressed by a short code.

    Items are simple dicts: {name, content, is_base64}
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    code = models.CharField(max_length=64)
    items = models.JSONField(default=list, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "code")
        ordering = ["-updated_at"]

    def __str__(self):  # pragma: no cover
        return f"SharedDrop({self.user}, {self.code})"


class UserAppInstall(models.Model):
    """Track which apps a user has installed from the Store."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    app = models.ForeignKey(App, on_delete=models.CASCADE)
    installed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "app")
        ordering = ["-installed_at"]

    def __str__(self):  # pragma: no cover
        return f"Install({self.user} -> {self.app})"


class Feedback(models.Model):
    CATEGORY_CHOICES = (
        ("feedback", "Feedback"),
        ("feature", "Feature Request"),
        ("bug", "Bug Report"),
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES, default="feedback")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):  # pragma: no cover
        return f"{self.user} - {self.category} - {self.created_at:%Y-%m-%d}"


# Chat MVP models
class Conversation(models.Model):
    KIND_CHOICES = (
        ("dm", "Direct Message"),
        ("room", "Room"),
    )
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default="dm")
    title = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):  # pragma: no cover
        return f"{self.kind}:{self.pk} {self.title}".strip()


class ConversationMember(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    invited = models.BooleanField(default=False)
    accepted = models.BooleanField(default=False)
    role = models.CharField(max_length=16, default='member')  # owner|moderator|member
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("conversation", "user")

    def __str__(self):  # pragma: no cover
        return f"Member({self.user} in {self.conversation_id})"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):  # pragma: no cover
        return f"Msg({self.sender} @ {self.created_at:%H:%M})"
