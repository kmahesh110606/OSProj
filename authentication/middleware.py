from django.shortcuts import redirect
from django.urls import reverse

class LoginRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        allowed_paths = [reverse('signin'), reverse('signup'), '/admin/', '/static/', '/media/']
        if not request.user.is_authenticated:
            if not any(request.path.startswith(path) for path in allowed_paths):
                return redirect('signin')
        return self.get_response(request)