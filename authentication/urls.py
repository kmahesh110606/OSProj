from django.contrib import admin
from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.home, name='home'),
        path('signup/', views.signup, name='signup'),
        path('signin/', views.signin, name='signin'),
        path('signout/', views.signout, name='signout'),
    path('activate/<slug:uidb64>/<slug:token>/', views.activate, name='activate'),
    path('forgot/', views.forgot_password, name='forgot'),
    path('reset/<slug:uidb64>/<slug:token>/', views.reset_password, name='reset'),
]
