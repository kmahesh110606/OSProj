from django.urls import path
from . import views


urlpatterns = [
    path("", views.desktop, name="webos-desktop"),
    path("api/state", views.get_state, name="webos-get-state"),
    path("api/state/save", views.save_state, name="webos-save-state"),
    # Built-in apps
    path("apps/calculator", views.calculator_app, name="webos-app-calculator"),
    path("apps/notepad", views.notepad_app, name="webos-app-notepad"),
    path("apps/explorer", views.explorer_app, name="webos-app-explorer"),
    path("apps/settings", views.settings_app, name="webos-app-settings"),
    path("apps/stopwatch", views.stopwatch_app, name="webos-app-stopwatch"),
    path("apps/texteditor", views.texteditor_app, name="webos-app-texteditor"),
    path("apps/gallery", views.gallery_app, name="webos-app-gallery"),
    path("apps/store", views.store_app, name="webos-app-store"),
    path("apps/whiteboard", views.whiteboard_app, name="webos-app-whiteboard"),
    path("apps/chat", views.chat_app, name="webos-app-chat"),
    path("apps/rooms", views.rooms_app, name="webos-app-rooms"),
    path("apps/html/<slug:slug>", views.app_html, name="webos-app-html"),
    # Notepad API
    path("api/notes/create", views.note_create, name="webos-note-create"),
    path("api/notes/<int:note_id>", views.note_detail, name="webos-note-detail"),
    path("api/notes/<int:note_id>/delete", views.note_delete, name="webos-note-delete"),
    # File system APIs
    path("api/fs/list", views.fs_list, name="webos-fs-list"),
    path("api/fs/mkdir", views.fs_mkdir, name="webos-fs-mkdir"),
    path("api/fs/write", views.fs_write, name="webos-fs-write"),
    path("api/fs/read", views.fs_read, name="webos-fs-read"),
    path("api/fs/delete", views.fs_delete, name="webos-fs-delete"),
    path("api/fs/upload", views.fs_upload, name="webos-fs-upload"),
    path("api/fs/download", views.fs_download, name="webos-fs-download"),
    path("api/fs/copy", views.fs_copy, name="webos-fs-copy"),
    path("api/fs/move", views.fs_move, name="webos-fs-move"),
    path("api/fs/rename", views.fs_rename, name="webos-fs-rename"),
    path("api/fs/images", views.fs_images, name="webos-fs-images"),
    # SharedDrop app and APIs
    path("apps/sharedrop", views.sharedrop_app, name="webos-app-sharedrop"),
    path("api/sharedrop/publish", views.sharedrop_publish, name="webos-sharedrop-publish"),
    path("api/sharedrop/list", views.sharedrop_list, name="webos-sharedrop-list"),
    path("api/sharedrop/receive", views.sharedrop_receive, name="webos-sharedrop-receive"),
    path("api/sharedrop/history", views.sharedrop_history, name="webos-sharedrop-history"),
    # Chat APIs
    path("api/chat/start_dm", views.chat_start_dm, name="webos-chat-start-dm"),
    path("api/chat/accept", views.chat_accept_invite, name="webos-chat-accept"),
    path("api/chat/list", views.chat_list_conversations, name="webos-chat-list"),
    path("api/chat/invites", views.chat_list_invites, name="webos-chat-invites"),
    path("api/chat/create_room", views.chat_create_room, name="webos-chat-create-room"),
    path("api/chat/invite", views.chat_invite_user, name="webos-chat-invite"),
    path("api/chat/rooms", views.chat_list_rooms, name="webos-chat-rooms"),
    path("api/chat/<int:conv_id>/messages", views.chat_messages, name="webos-chat-messages"),
    path("api/chat/<int:conv_id>/send", views.chat_send, name="webos-chat-send"),
    # Proxy for PWAs
    path("api/proxy", views.proxy, name="webos-proxy"),
    # Store APIs
    path("api/store/apps", views.store_list, name="webos-store-list"),
    path("api/store/install", views.store_install, name="webos-store-install"),
    path("api/store/uninstall", views.store_uninstall, name="webos-store-uninstall"),
    path("api/store/upload", views.store_upload, name="webos-store-upload"),
    # Account API
    path("api/account", views.account_api, name="webos-account"),
    path("api/account/delete", views.account_delete, name="webos-account-delete"),
    path("api/account/avatar", views.account_avatar, name="webos-account-avatar"),
    path("api/account/password", views.account_password, name="webos-account-password"),
    # Storage info
    path("api/storage", views.storage_info, name="webos-storage-info"),
    path("api/premium/buy", views.premium_buy, name="webos-premium-buy"),
    # Feedback
    path("api/feedback", views.feedback_submit, name="webos-feedback"),
]
