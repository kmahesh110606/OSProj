
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from .models import CustomUser

def home(request):
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
        login(request, user)
        return redirect('home')
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