
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from .models import CustomUser
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes
from django.core.mail import send_mail
from django.conf import settings
from .tokens import generate_token
from django.contrib.auth.hashers import make_password

def home(request):
    # Redirect authenticated users to the Web OS desktop
    if request.user.is_authenticated:
        return redirect('webos-desktop')
    return render(request, "authentication/index.html")

def signup(request):
    if request.method == "POST":
        email = request.POST.get('email')
        phone = request.POST.get('phone')
        username = request.POST.get('username')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')
        if CustomUser.objects.filter(email=email).exists():
            messages.error(request, "Email already exists")
            return redirect('signup')
        if CustomUser.objects.filter(phone=phone).exists():
            messages.error(request, "Phone already exists")
            return redirect('signup')
        if CustomUser.objects.filter(username=username).exists():
            messages.error(request, "Username already exists")
            return redirect('signup')
        if password != confirm_password:
            messages.error(request, "Passwords do not match")
            return redirect('signup')
        user = CustomUser.objects.create_user(email=email, phone=phone, username=username, password=password)
        # Require email verification before activation
        user.is_active = False
        user.save(update_fields=['is_active'])
        # Send activation email (console backend in dev)
        try:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = generate_token.make_token(user)
            activate_link = f"http://{request.get_host()}/activate/{uid}/{token}/"
            subject = "Activate your account"
            body = f"Hello {user.username},\n\nPlease confirm your email to activate your account:\n{activate_link}\n\n"
            send_mail(subject, body, getattr(settings,'DEFAULT_FROM_EMAIL','noreply@example.com'), [user.email], fail_silently=True)
        except Exception:
            pass
        messages.success(request, "Account created. Please check your email to activate your account.")
        return redirect('signin')
    return render(request, "authentication/signup.html")

def signin(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            if not user.is_active:
                messages.error(request, "Please verify your email to activate your account.")
                return redirect('signin')
            login(request, user)
            return redirect('home')
        else:
            messages.error(request, "Invalid username or password")
            return redirect('signin')
    return render(request, "authentication/signin.html")

def signout(request):
    logout(request)
    messages.success(request, "Logged Out Successfully!!")
    return redirect('signin')

def activate(request, uidb64, token):
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        user = CustomUser.objects.get(pk=uid)
    except Exception:
        user = None
    if user is not None and generate_token.check_token(user, token):
        user.is_active = True
        user.save(update_fields=['is_active'])
        messages.success(request, "Email verified. You can sign in now.")
        return redirect('signin')
    messages.error(request, "Activation link is invalid or expired.")
    return redirect('signup')

def forgot_password(request):
    if request.method == 'POST':
        email = request.POST.get('email', '').strip()
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            # Don't reveal whether email exists
            messages.success(request, "If an account exists for that email, we've sent a reset link.")
            return redirect('forgot')
        try:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = generate_token.make_token(user)
            link = f"http://{request.get_host()}/reset/{uid}/{token}/"
            subject = "Reset your password"
            body = f"Hello {user.username},\n\nReset your password using the link below:\n{link}\n\nIf you didn't request this, ignore this email."
            send_mail(subject, body, getattr(settings,'DEFAULT_FROM_EMAIL','noreply@example.com'), [user.email], fail_silently=True)
        except Exception:
            pass
        messages.success(request, "If an account exists for that email, we've sent a reset link.")
        return redirect('forgot')
    return render(request, 'authentication/forgot.html')

def reset_password(request, uidb64, token):
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        user = CustomUser.objects.get(pk=uid)
    except Exception:
        user = None
    if user is None or not generate_token.check_token(user, token):
        messages.error(request, 'Reset link is invalid or expired.')
        return redirect('forgot')
    if request.method == 'POST':
        pwd = request.POST.get('password', '')
        cpwd = request.POST.get('confirm_password', '')
        if not pwd:
            messages.error(request, 'Password cannot be empty.')
            return redirect(request.path)
        if pwd != cpwd:
            messages.error(request, 'Passwords do not match.')
            return redirect(request.path)
        user.set_password(pwd)
        user.save(update_fields=['password'])
        messages.success(request, 'Password reset. You can sign in now.')
        return redirect('signin')
    return render(request, 'authentication/reset.html')