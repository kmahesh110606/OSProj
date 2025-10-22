
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
import secrets
import string

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
        # Create active account immediately (no email verification for now)
        user = CustomUser.objects.create_user(email=email, phone=phone, username=username, password=password)
        user.is_active = True
        user.save(update_fields=['is_active'])
        # Auto-login for a smoother first-run experience
        login(request, user)
        messages.success(request, "Account created. You're signed in.")
        return redirect('webos-desktop')
    return render(request, "authentication/signup.html")

def signin(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
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
    # Temporarily disabled: future flow will verify via phone number
    if request.method == 'POST':
        messages.info(request, "Password reset via phone verification is coming soon.")
        return render(request, 'authentication/forgot.html')
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