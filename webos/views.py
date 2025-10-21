from __future__ import annotations

import json
from typing import Any

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import csrf_exempt

from .models import App, Note, UserState, UserFile, SharedDrop, UserAppInstall, Feedback, Conversation, ConversationMember, Message
from django.contrib.auth import get_user_model
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.views.decorators.http import require_http_methods
import urllib.parse
import urllib.request
import io
import zipfile
from datetime import timedelta, datetime, timezone
import base64
import re
from http.cookies import SimpleCookie
import json as _json


@login_required
def desktop(request: HttpRequest) -> HttpResponse:
    # Ensure there is a state object for the user
    UserState.objects.get_or_create(user=request.user)
    # Show only apps installed by this user (plus built-ins rendered in template)
    install_ids = list(UserAppInstall.objects.filter(user=request.user).values_list('app_id', flat=True))
    apps = App.objects.filter(is_enabled=True, id__in=install_ids).order_by("name")
    return render(request, "webos/desktop.html", {"apps": apps})


@login_required
def get_state(request: HttpRequest) -> JsonResponse:
    state, _ = UserState.objects.get_or_create(user=request.user)
    return JsonResponse({"state": state.state_json or {}}, status=200)


@csrf_exempt
@login_required
def save_state(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = request.POST.dict()
    state_json = payload.get("state") or {}
    if isinstance(state_json, str):
        try:
            state_json = json.loads(state_json)
        except Exception:
            state_json = {}
    state, _ = UserState.objects.get_or_create(user=request.user)
    # Merge to avoid wiping unrelated keys
    current = state.state_json if isinstance(state.state_json, dict) else {}
    if isinstance(state_json, dict):
        current.update(state_json)
        state.state_json = current
    else:
        state.state_json = state_json
    state.save()
    return JsonResponse({"ok": True})


# Built-in Apps
@login_required
def calculator_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/calculator.html")


@login_required
def notepad_app(request: HttpRequest) -> HttpResponse:
    # Ensure root directory exists for FS operations
    UserFile.objects.get_or_create(user=request.user, path='/', is_dir=True)
    return render(request, "webos/apps/notepad.html")


@login_required
def explorer_app(request: HttpRequest) -> HttpResponse:
    # Ensure root directory
    UserFile.objects.get_or_create(user=request.user, path='/', is_dir=True)
    return render(request, "webos/apps/explorer.html")


@login_required
def settings_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/settings.html")


@login_required
def stopwatch_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/stopwatch.html")


@login_required
def texteditor_app(request: HttpRequest) -> HttpResponse:
    # The template reads the ?path= query to load and save via FS APIs
    return render(request, "webos/apps/texteditor.html")


@login_required
def editor_app(request: HttpRequest) -> HttpResponse:
    # Unified editor that can show notes list and open FS text files
    notes = Note.objects.filter(user=request.user)
    return render(request, "webos/apps/editor.html", {"notes": notes})


@login_required
def note_detail(request: HttpRequest, note_id: int) -> JsonResponse:
    note = get_object_or_404(Note, id=note_id, user=request.user)
    if request.method == "GET":
        return JsonResponse({"id": note.id, "title": note.title, "content": note.content})
    elif request.method == "POST":
        title = request.POST.get("title", note.title)
        content = request.POST.get("content", note.content)
        note.title = title
        note.content = content
        note.save()
        return JsonResponse({"ok": True})
    else:
        return JsonResponse({"error": "Method not allowed"}, status=405)


@login_required
def note_create(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    title = request.POST.get("title", "Untitled")
    content = request.POST.get("content", "")
    n = Note.objects.create(user=request.user, title=title, content=content)
    return JsonResponse({"id": n.id, "title": n.title})


@login_required
def note_delete(request: HttpRequest, note_id: int) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    note = get_object_or_404(Note, id=note_id, user=request.user)
    note.delete()
    return JsonResponse({"ok": True})


# File Explorer APIs
@login_required
def fs_list(request: HttpRequest) -> JsonResponse:
    path = request.GET.get('path', '/')
    if not path.startswith('/'):
        path = '/' + path
    # list direct children
    prefix = path.rstrip('/') + '/'
    entries = []
    seen = set()
    for uf in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('path'):
        # Skip the directory node itself (avoid empty-name entry and self-recursion)
        try:
            if uf.path == prefix:
                continue
        except Exception:
            pass
        rel = uf.path[len(prefix):]
        if '/' in rel:
            name = rel.split('/',1)[0]
            child_path = prefix + name
            if child_path not in seen:
                entries.append({"name": name, "path": child_path, "is_dir": True})
                seen.add(child_path)
        else:
            entries.append({"name": rel, "path": uf.path, "is_dir": uf.is_dir})
    return JsonResponse({"path": path, "entries": entries})


@login_required
def fs_mkdir(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    base = request.POST.get('path','/')
    name = request.POST.get('name','New Folder')
    if not base.endswith('/'):
        base += '/'
    full = base + name
    uf, created = UserFile.objects.get_or_create(user=request.user, path=full, defaults={"is_dir": True})
    if not created and not uf.is_dir:
        return JsonResponse({"error": "File exists"}, status=400)
    return JsonResponse({"ok": True})


@login_required
def fs_write(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    path = request.POST.get('path')
    content = request.POST.get('content','')
    if not path or path.endswith('/'):
        return JsonResponse({"error": "Invalid file path"}, status=400)
    uf, _ = UserFile.objects.get_or_create(user=request.user, path=path, defaults={"is_dir": False})
    if uf.is_dir:
        return JsonResponse({"error": "Is a directory"}, status=400)
    # Write plain text content
    uf.content = content
    uf.save()
    return JsonResponse({"ok": True})


@login_required
def fs_read(request: HttpRequest) -> JsonResponse:
    path = request.GET.get('path')
    if not path:
        return JsonResponse({"error": "Path required"}, status=400)
    try:
        uf = UserFile.objects.get(user=request.user, path=path)
    except UserFile.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    if uf.is_dir:
        return JsonResponse({"error": "Is a directory"}, status=400)
    # If content was stored as base64 (uploads), mark and strip prefix
    is_b64 = False
    content = uf.content or ""
    if content.startswith('B64:'):
        is_b64 = True
        content = content[4:]
    return JsonResponse({"path": uf.path, "content": content, "is_base64": is_b64})


@login_required
def fs_delete(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    path = request.POST.get('path')
    if not path or path == '/':
        return JsonResponse({"error": "Invalid path"}, status=400)
    # delete file or subtree
    UserFile.objects.filter(user=request.user, path__startswith=path).delete()
    return JsonResponse({"ok": True})


@login_required
def fs_download(request: HttpRequest):
    """Download a file or a folder (as zip)."""
    path = request.GET.get('path')
    if not path:
        return HttpResponse('Path required', status=400)
    try:
        uf = UserFile.objects.get(user=request.user, path=path)
    except UserFile.DoesNotExist:
        return HttpResponse('Not found', status=404)
    if not uf.is_dir:
        # Single file
        data = uf.content or ''
        # Special-case whiteboard files: export as PNG using embedded preview
        try:
            if path.lower().endswith('.wbdz'):
                try:
                    import json as _json
                    obj = _json.loads(data)
                    b64 = obj.get('preview_b64_png') if isinstance(obj, dict) else None
                except Exception:
                    b64 = None
                if b64:
                    import base64 as _b64
                    raw = _b64.b64decode(b64)
                    resp = HttpResponse(raw, content_type='image/png')
                    png_name = (path.split('/')[-1] or 'whiteboard').rsplit('.',1)[0] + '.png'
                    resp['Content-Disposition'] = f'attachment; filename="{png_name}"'
                    return resp
        except Exception:
            pass
        # If base64, decode else serve as text
        try:
            if data.startswith('B64:'):
                import base64
                raw = base64.b64decode(data[4:])
                resp = HttpResponse(raw, content_type='application/octet-stream')
            else:
                resp = HttpResponse(data, content_type='text/plain; charset=utf-8')
        except Exception:
            resp = HttpResponse(data, content_type='application/octet-stream')
        name = path.split('/')[-1] or 'file'
        resp['Content-Disposition'] = f'attachment; filename="{name}"'
        return resp
    # Folder -> zip
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, 'w', zipfile.ZIP_DEFLATED) as zf:
        prefix = path.rstrip('/') + '/'
        for entry in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('path'):
            if entry.is_dir:
                continue
            rel = entry.path[len(prefix):]
            data = entry.content or ''
            if data.startswith('B64:'):
                import base64
                buf = base64.b64decode(data[4:])
                zf.writestr(rel, buf)
            else:
                zf.writestr(rel, data)
    mem.seek(0)
    resp = HttpResponse(mem.read(), content_type='application/zip')
    name = (path.strip('/').replace('/', '_') or 'folder') + '.zip'
    resp['Content-Disposition'] = f'attachment; filename="{name}"'
    return resp


@login_required
@require_http_methods(["POST"])
def fs_download_multi(request: HttpRequest) -> HttpResponse:
    """Download multiple paths (files and/or folders) as a single zip.
    Expects JSON body: {"paths": ["/path1", "/path2", ...]}
    """
    try:
        body = request.body.decode('utf-8') or '{}'
        payload = _json.loads(body)
        paths = payload.get('paths') or []
        if not isinstance(paths, list):
            return HttpResponse('Invalid payload', status=400)
        paths = [p for p in paths if isinstance(p, str) and p.strip()]
        if not paths:
            return HttpResponse('No paths', status=400)
    except Exception:
        return HttpResponse('Bad Request', status=400)

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            # Normalize
            if not path.startswith('/'):
                path = '/' + path
            # Find entry; for directories, include subtree
            try:
                uf = UserFile.objects.get(user=request.user, path=path)
            except UserFile.DoesNotExist:
                continue
            if uf.is_dir:
                prefix = path.rstrip('/') + '/'
                base_name = path.strip('/')
                for entry in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('path'):
                    if entry.is_dir:
                        continue
                    rel = entry.path[len(prefix):]
                    arcname = (base_name + '/' + rel) if base_name else rel
                    data = entry.content or ''
                    if data.startswith('B64:'):
                        try:
                            buf = base64.b64decode(data[4:])
                        except Exception:
                            buf = (data[4:] or '').encode('utf-8', errors='ignore')
                        zf.writestr(arcname, buf)
                    else:
                        zf.writestr(arcname, data)
            else:
                # single file
                name = path.strip('/') or 'file'
                data = uf.content or ''
                if data.startswith('B64:'):
                    try:
                        buf = base64.b64decode(data[4:])
                    except Exception:
                        buf = (data[4:] or '').encode('utf-8', errors='ignore')
                    zf.writestr(name, buf)
                else:
                    zf.writestr(name, data)
    mem.seek(0)
    resp = HttpResponse(mem.read(), content_type='application/zip')
    resp['Content-Disposition'] = 'attachment; filename="download.zip"'
    return resp


def _ensure_dir(user, path: str):
    if not path.endswith('/'):
        path += '/'
    UserFile.objects.get_or_create(user=user, path=path, defaults={"is_dir": True})


@login_required
def fs_copy(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    src = request.POST.get('src'); dst = request.POST.get('dst')
    if not src or not dst:
        return JsonResponse({"error": "src and dst required"}, status=400)
    try:
        src_entry = UserFile.objects.get(user=request.user, path=src)
    except UserFile.DoesNotExist:
        return JsonResponse({"error": "Source not found"}, status=404)
    if src_entry.is_dir:
        # copy subtree
        prefix = src.rstrip('/') + '/'
        _ensure_dir(request.user, dst)
        for entry in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('path'):
            rel = entry.path[len(prefix):]
            new_path = (dst.rstrip('/') + '/' + rel)
            if entry.is_dir:
                _ensure_dir(request.user, new_path)
            else:
                uf, _ = UserFile.objects.get_or_create(user=request.user, path=new_path, defaults={"is_dir": False})
                uf.content = entry.content; uf.is_dir = False; uf.save()
    else:
        # copy file into dst directory
        if dst.endswith('/'):
            name = src.split('/')[-1]
            new_path = dst + name
        else:
            new_path = dst
        _parent = new_path.rsplit('/',1)[0] or '/'
        _ensure_dir(request.user, _parent)
        uf, _ = UserFile.objects.get_or_create(user=request.user, path=new_path, defaults={"is_dir": False})
        uf.content = src_entry.content; uf.is_dir = False; uf.save()
    return JsonResponse({"ok": True})


@login_required
def fs_move(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    src = request.POST.get('src'); dst = request.POST.get('dst')
    if not src or not dst:
        return JsonResponse({"error": "src and dst required"}, status=400)
    try:
        src_entry = UserFile.objects.get(user=request.user, path=src)
    except UserFile.DoesNotExist:
        return JsonResponse({"error": "Source not found"}, status=404)
    if src_entry.is_dir:
        prefix = src.rstrip('/') + '/'
        new_prefix = dst.rstrip('/') + '/'
        _ensure_dir(request.user, new_prefix)
        for entry in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('-path'):
            rel = entry.path[len(prefix):]
            new_path = new_prefix + rel
            entry.path = new_path
            entry.save()
        # move the dir node itself
        src_entry.path = dst if dst.endswith('/') else (dst + '/')
        src_entry.save()
    else:
        new_path = dst if not dst.endswith('/') else (dst + src.split('/')[-1])
        _ensure_dir(request.user, new_path.rsplit('/',1)[0] or '/')
        src_entry.path = new_path
        src_entry.save()
    return JsonResponse({"ok": True})


@login_required
def fs_rename(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    path = request.POST.get('path'); new_name = request.POST.get('name')
    if not path or not new_name:
        return JsonResponse({"error": "path and name required"}, status=400)
    try:
        entry = UserFile.objects.get(user=request.user, path=path)
    except UserFile.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    parent = path.rsplit('/',1)[0]
    if entry.is_dir and not path.endswith('/'):
        path += '/'
    base_parent = parent + ('/' if parent and not parent.endswith('/') else '')
    new_path = base_parent + new_name + ('/' if entry.is_dir else '')
    if entry.is_dir:
        # rename subtree prefix
        prefix = path
        new_prefix = new_path
        for e in UserFile.objects.filter(user=request.user, path__startswith=prefix).order_by('-path'):
            e.path = new_prefix + e.path[len(prefix):]
            e.save()
        entry.path = new_path
        entry.save()
    else:
        entry.path = new_path
        entry.save()
    return JsonResponse({"ok": True, "path": new_path})


@login_required
def fs_images(request: HttpRequest) -> JsonResponse:
    exts = {'.png','.jpg','.jpeg','.gif','.webp','.bmp'}
    imgs = []
    for uf in UserFile.objects.filter(user=request.user, is_dir=False):
        name = uf.path.split('/')[-1]
        lower = name.lower()
        if any(lower.endswith(e) for e in exts):
            imgs.append({"name": name, "path": uf.path})
    return JsonResponse({"images": imgs})


@login_required
def fs_upload(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    base = request.POST.get('path','/')
    f = request.FILES.get('file')
    if not f:
        return JsonResponse({"error": "No file"}, status=400)
    if not base.endswith('/'):
        base += '/'
    # Read uploaded content as text; for binary, store as base64 with a prefix
    content = f.read()
    # If binary (image), keep bytes; we'll store as base64 string
    try:
        text = content.decode('utf-8')
    except Exception:
        import base64
        text = 'B64:' + base64.b64encode(content).decode('ascii')
    name = f.name
    full = base + name
    uf, _ = UserFile.objects.get_or_create(user=request.user, path=full, defaults={"is_dir": False})
    uf.content = text
    uf.is_dir = False
    uf.save()
    return JsonResponse({"ok": True, "path": full})


@login_required
def gallery_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/gallery.html")
@login_required
def store_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/store.html")

@login_required
def whiteboard_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/whiteboard.html")


# Chat app views/APIs (MVP)
@login_required
def chat_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/chat.html")


@login_required
def rooms_app(request: HttpRequest) -> HttpResponse:
    # Simple wrapper around rooms.html for now
    return render(request, "webos/apps/rooms.html")


@login_required
@require_http_methods(["POST"]) 
def chat_start_dm(request: HttpRequest) -> JsonResponse:
    """Start or fetch a DM conversation with another user by username. Uses invite/accept flow."""
    other_name = (request.POST.get('username') or '').strip()
    if not other_name:
        return JsonResponse({"error":"username required"}, status=400)
    User = get_user_model()
    # Case-sensitive match; prevent inviting self
    try:
        other = User.objects.get(username=other_name)
    except User.DoesNotExist:
        return JsonResponse({"error":"user not found"}, status=404)
    if other == request.user:
        return JsonResponse({"error":"cannot invite yourself"}, status=400)
    # Find existing DM with exactly these two members
    conv = (Conversation.objects
            .filter(kind='dm', members__user=request.user)
            .filter(members__user=other)
            .first())
    status = 'exists'
    if not conv:
        conv = Conversation.objects.create(kind='dm')
        ConversationMember.objects.create(conversation=conv, user=request.user, invited=False, accepted=True, role='owner')
        ConversationMember.objects.create(conversation=conv, user=other, invited=True, accepted=False, role='member')
        status = 'invited'
    else:
        # Ensure there is a member row for other; if not, add and invite
        om = ConversationMember.objects.filter(conversation=conv, user=other).first()
        sm = ConversationMember.objects.filter(conversation=conv, user=request.user).first()
        if not om:
            ConversationMember.objects.create(conversation=conv, user=other, invited=True, accepted=False, role='member')
            status = 'invited'
        else:
            if om.accepted:
                status = 'exists_accepted'
            elif om.invited and not om.accepted:
                status = 'already_invited'
            else:
                om.invited = True; om.accepted = False; om.save(update_fields=['invited','accepted'])
                status = 'invited'
        # Ensure self is a member and accepted
        if not sm:
            ConversationMember.objects.create(conversation=conv, user=request.user, invited=False, accepted=True, role='owner')
        elif not sm.accepted:
            sm.accepted = True; sm.invited = False; sm.save(update_fields=['accepted','invited'])
    return JsonResponse({"ok": True, "conversation_id": conv.id, "status": status})


@login_required
@require_http_methods(["POST"]) 
def chat_accept_invite(request: HttpRequest) -> JsonResponse:
    conv_id = request.POST.get('conversation_id')
    try:
        m = ConversationMember.objects.get(conversation_id=conv_id, user=request.user)
    except ConversationMember.DoesNotExist:
        return JsonResponse({"error":"not invited"}, status=404)
    m.invited = False; m.accepted = True; m.save(update_fields=['invited','accepted'])
    return JsonResponse({"ok": True})


# (Removed earlier duplicate chat_list_invites; single implementation lives below.)


@login_required
@require_http_methods(["POST"]) 
def chat_create_room(request: HttpRequest) -> JsonResponse:
    """Create a room conversation with a title; current user becomes owner and is accepted."""
    title = (request.POST.get('title') or '').strip()
    if not title:
        return JsonResponse({"error": "title required"}, status=400)
    conv = Conversation.objects.create(kind='room', title=title)
    ConversationMember.objects.create(conversation=conv, user=request.user, invited=False, accepted=True, role='owner')
    return JsonResponse({"ok": True, "conversation_id": conv.id})


@login_required
def chat_list_rooms(request: HttpRequest) -> JsonResponse:
    """List accepted room conversations for current user."""
    qs = (Conversation.objects.filter(kind='room', members__user=request.user, members__accepted=True)
          .distinct().order_by('-created_at'))
    rows = [{"id": c.id, "title": c.title} for c in qs]
    return JsonResponse({"items": rows})


@login_required
def chat_list_conversations(request: HttpRequest) -> JsonResponse:
    qs = (Conversation.objects
          .filter(members__user=request.user, members__accepted=True)
          .distinct()
          .order_by('-created_at')
          .prefetch_related('members__user'))
    rows = []
    me = request.user
    for c in qs:
        title = c.title or ''
        peer_info = None
        if c.kind == 'dm':
            try:
                # Pick the other accepted member's username as DM title
                others = [m for m in c.members.all() if m.user_id != me.id and m.accepted]
                if others:
                    other_member = others[0]
                    title = other_member.user.username
                    # Enrich with avatar and online presence from UserState
                    try:
                        st = UserState.objects.filter(user=other_member.user).first()
                        avatar = None; about = None; online = False
                        if st and isinstance(st.state_json, dict):
                            avatar = st.state_json.get('avatar')
                            about = st.state_json.get('about')
                            ls = st.state_json.get('last_seen')
                            try:
                                import time
                                now = int(time.time())
                                ts = int(ls) if isinstance(ls, (int, float, str)) and str(ls).isdigit() else None
                                if ts is None and isinstance(ls, str):
                                    # try ISO parse fallback
                                    from datetime import datetime
                                    try:
                                        ts = int(datetime.fromisoformat(ls).timestamp())
                                    except Exception:
                                        ts = None
                                if ts is not None and (now - ts) <= 120:
                                    online = True
                            except Exception:
                                online = False
                        peer_info = {"username": other_member.user.username, "avatar": avatar, "about": about, "online": online}
                    except Exception:
                        peer_info = {"username": other_member.user.username, "avatar": None, "about": None, "online": False}
            except Exception:
                pass
        rows.append({"id": c.id, "kind": c.kind, "title": title, "peer": peer_info})
    return JsonResponse({"items": rows})


@login_required
def chat_list_invites(request: HttpRequest) -> JsonResponse:
    """List pending invites for the current user (not yet accepted)."""
    qs = ConversationMember.objects.filter(user=request.user, invited=True, accepted=False).select_related('conversation').order_by('-conversation__created_at')
    items = []
    for m in qs:
        items.append({
            "id": m.conversation_id,
            "title": getattr(m.conversation, 'title', '') or (m.conversation.kind.upper()+f" #{m.conversation_id}"),
            "kind": m.conversation.kind,
        })
    return JsonResponse({"items": items})


@login_required
def chat_messages(request: HttpRequest, conv_id: int) -> JsonResponse:
    try:
        ConversationMember.objects.get(conversation_id=conv_id, user=request.user, accepted=True)
    except ConversationMember.DoesNotExist:
        return JsonResponse({"error":"no access"}, status=403)
    rows = [{"id": m.id, "sender": m.sender.username, "content": m.content, "at": m.created_at.isoformat()} for m in Message.objects.filter(conversation_id=conv_id).order_by('created_at')]
    return JsonResponse({"items": rows})


@login_required
@require_http_methods(["POST"]) 
def chat_send(request: HttpRequest, conv_id: int) -> JsonResponse:
    try:
        ConversationMember.objects.get(conversation_id=conv_id, user=request.user, accepted=True)
    except ConversationMember.DoesNotExist:
        return JsonResponse({"error":"no access"}, status=403)
    content = (request.POST.get('content') or '').strip()
    if not content:
        return JsonResponse({"error":"empty"}, status=400)
    Message.objects.create(conversation_id=conv_id, sender=request.user, content=content)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"]) 
def chat_invite_user(request: HttpRequest) -> JsonResponse:
    """Invite a user to an existing room by username. Requires inviter to be an accepted member."""
    conv_id = request.POST.get('conversation_id')
    username = (request.POST.get('username') or '').strip()
    if not conv_id or not username:
        return JsonResponse({"error":"conversation_id and username required"}, status=400)
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        return JsonResponse({"error":"conversation not found"}, status=404)
    # Only allow inviting into rooms for now
    if conv.kind != 'room':
        return JsonResponse({"error":"invites only supported for rooms"}, status=400)
    inviter = ConversationMember.objects.filter(conversation=conv, user=request.user, accepted=True).first()
    if not inviter:
        return JsonResponse({"error":"no access"}, status=403)
    User = get_user_model()
    try:
        other = User.objects.get(username=username)
    except User.DoesNotExist:
        return JsonResponse({"error":"user not found"}, status=404)
    if other == request.user:
        return JsonResponse({"error":"cannot invite yourself"}, status=400)
    # Upsert membership for invitee
    om = ConversationMember.objects.filter(conversation=conv, user=other).first()
    if not om:
        ConversationMember.objects.create(conversation=conv, user=other, invited=True, accepted=False, role='member')
        return JsonResponse({"ok": True, "status": "invited"})
    if om.accepted:
        return JsonResponse({"ok": True, "status": "exists_accepted"})
    if om.invited and not om.accepted:
        return JsonResponse({"ok": True, "status": "already_invited"})
    om.invited = True; om.accepted = False; om.save(update_fields=['invited','accepted'])
    return JsonResponse({"ok": True, "status": "invited"})


@login_required
def store_list(request: HttpRequest) -> JsonResponse:
    # List all enabled apps and which ones the user has installed (include built-ins as non-uninstallable)
    installs = set(UserAppInstall.objects.filter(user=request.user).values_list('app_id', flat=True))
    rows = []
    for a in App.objects.filter(is_enabled=True).order_by('name'):
        rows.append({
            "id": a.id, "slug": a.slug, "name": a.name, "kind": a.kind,
            "icon": a.icon, "launch_url": a.launch_url, "use_proxy": a.use_proxy,
            "submitted_by": getattr(a.submitted_by, 'username', ''),
            "installed": a.id in installs,
            "builtin": False,
            "uninstallable": True,
        })
    # Include built-in apps for visibility in Installed section
    try:
        BUILTIN = [
            {"slug":"store","name":"Store","icon":"/static/assets/icons/store.svg","kind":"builtin"},
            {"slug":"explorer","name":"File Explorer","icon":"/static/assets/icons/explorer.svg","kind":"builtin"},
            {"slug":"notepad","name":"Notepad","icon":"/static/assets/icons/notepad.svg","kind":"builtin"},
            {"slug":"gallery","name":"Gallery","icon":"/static/assets/icons/gallery.svg","kind":"builtin"},
            {"slug":"sharedrop","name":"ShareDrop","icon":"/static/assets/icons/sharedrop.svg","kind":"builtin"},
            {"slug":"settings","name":"Settings","icon":"/static/assets/icons/settings.svg","kind":"builtin"},
            {"slug":"stopwatch","name":"Stopwatch","icon":"/static/assets/icons/stopwatch.svg","kind":"builtin"},
            {"slug":"whiteboard","name":"Whiteboard","icon":"/static/assets/icons/whiteboard.svg","kind":"builtin"},
            {"slug":"chat","name":"Chat","icon":"/static/assets/icons/chat.svg","kind":"builtin"},
            {"slug":"rooms","name":"Rooms","icon":"/static/assets/icons/rooms.svg","kind":"builtin"},
        ]
        for b in BUILTIN:
            rows.append({
                "id": None,
                "slug": b["slug"],
                "name": b["name"],
                "kind": b["kind"],
                "icon": b["icon"],
                "launch_url": None,
                "use_proxy": False,
                "submitted_by": "",
                "installed": True,
                "builtin": True,
                "uninstallable": False,
            })
    except Exception:
        pass
    return JsonResponse({"apps": rows})


@login_required
def store_install(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    app_id = request.POST.get('app_id')
    try:
        a = App.objects.get(pk=app_id, is_enabled=True)
    except App.DoesNotExist:
        return JsonResponse({"error": "App not found"}, status=404)
    UserAppInstall.objects.get_or_create(user=request.user, app=a)
    return JsonResponse({"ok": True})


@login_required
def store_uninstall(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    app_id = request.POST.get('app_id')
    UserAppInstall.objects.filter(user=request.user, app_id=app_id).delete()
    return JsonResponse({"ok": True})


@login_required
def store_upload(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    # Minimal app submission: slug, name, kind, icon, launch_url, use_proxy
    slug = (request.POST.get('slug') or '').strip()
    name = (request.POST.get('name') or '').strip()
    kind = (request.POST.get('kind') or 'pwa').strip()
    icon = (request.POST.get('icon') or '').strip()
    launch_url = (request.POST.get('launch_url') or '').strip()
    use_proxy = request.POST.get('use_proxy') in {'1','true','on'}
    if not slug or not name:
        return JsonResponse({"error": "slug and name required"}, status=400)
    a, created = App.objects.get_or_create(slug=slug, defaults={
        'name': name, 'kind': kind, 'icon': icon, 'launch_url': launch_url or None, 'use_proxy': use_proxy,
        'is_enabled': True, 'submitted_by': request.user,
    })
    if not created:
        # update existing (owned by anyone) – keep it simple
        a.name = name; a.kind = kind; a.icon = icon; a.launch_url = launch_url or None; a.use_proxy = use_proxy; a.submitted_by = request.user; a.is_enabled = True; a.save()
    return JsonResponse({"ok": True, "id": a.id})


@login_required
def storage_info(request: HttpRequest) -> JsonResponse:
    """Return storage usage for the current user. Limit is based on plan (free/premium)."""
    # Plan: default free 2 GB, premium 50 GB
    try:
        st, _ = UserState.objects.get_or_create(user=request.user)
        plan = (st.state_json or {}).get('plan','free')
    except Exception:
        plan = 'free'
    limit_bytes = 50 * 1024 * 1024 * 1024 if plan == 'premium' else 2 * 1024 * 1024 * 1024
    used = 0
    for uf in UserFile.objects.filter(user=request.user, is_dir=False).only('content'):
        data = uf.content or ''
        if data.startswith('B64:'):
            try:
                used += len(base64.b64decode(data[4:], validate=False))
            except Exception:
                used += max(0, len(data) - 4)
        else:
            used += len((data).encode('utf-8', errors='ignore'))
    return JsonResponse({"used_bytes": used, "limit_bytes": limit_bytes, "percent": round((used/limit_bytes)*100, 2) if limit_bytes else 0.0, "plan": plan})


@login_required
@require_http_methods(["POST"])
def feedback_submit(request: HttpRequest) -> JsonResponse:
    category = (request.POST.get('category') or 'feedback').strip().lower()
    message = (request.POST.get('message') or '').strip()
    if not message:
        return JsonResponse({"error": "Message required"}, status=400)
    if category not in {"feedback","feature","bug"}:
        category = "feedback"
    Feedback.objects.create(user=request.user, category=category, message=message)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def account_delete(request: HttpRequest) -> JsonResponse:
    confirm = (request.POST.get('confirm') or '').strip()
    if confirm != 'DELETE':
        return JsonResponse({"error": "Type DELETE to confirm"}, status=400)
    user = request.user
    # Log out first to clear session
    auth_logout(request)
    # Deleting user will cascade to related rows via FK
    user.delete()
    return JsonResponse({"ok": True, "redirect": "/"})


# SharedDrop: publish and receive small files across users via username or code
@login_required
def sharedrop_app(request: HttpRequest) -> HttpResponse:
    return render(request, "webos/apps/sharedrop.html")


@login_required
def sharedrop_publish(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    code = request.POST.get('code', '').strip() or 'default'
    # items as JSON array of {name, content, is_base64}
    try:
        items_raw = request.POST.get('items', '[]')
        items = json.loads(items_raw)
    except Exception:
        return JsonResponse({"error": "Invalid items"}, status=400)
    drop, _ = SharedDrop.objects.get_or_create(user=request.user, code=code)
    # sanitize items
    safe = []
    for it in items:
        name = str(it.get('name','')).strip()[:200]
        if not name:
            continue
        content = it.get('content','')
        is_b64 = bool(it.get('is_base64'))
        safe.append({"name": name, "content": content, "is_base64": is_b64})
    drop.items = safe
    # Optional expiry (minutes)
    try:
        minutes = int(request.POST.get('expire_minutes') or '0')
        if minutes > 0:
            drop.expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    except Exception:
        pass
    drop.save()
    # Record history in user state (append-only, capped length)
    try:
        st,_ = UserState.objects.get_or_create(user=request.user)
        payload = st.state_json if isinstance(st.state_json, dict) else {}
        hist = payload.get('sharedrop_history') or []
        now = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M')
        for it in safe:
            hist.insert(0, {"dir":"sent","name":it.get('name','item'),"code":code,"when":now})
        payload['sharedrop_history'] = hist[:200]
        st.state_json = payload
        st.save(update_fields=['state_json'])
    except Exception:
        pass
    return JsonResponse({"ok": True})


@login_required
def sharedrop_list(request: HttpRequest) -> JsonResponse:
    code = request.GET.get('code', '').strip() or 'default'
    drop, _ = SharedDrop.objects.get_or_create(user=request.user, code=code)
    # Expiry: respect explicit expires_at if set; fallback to 5 minutes from last update
    expired = False
    try:
        now = datetime.now(timezone.utc)
        if getattr(drop, 'expires_at', None):
            expired = now > drop.expires_at
        elif drop.updated_at and (now - drop.updated_at) > timedelta(minutes=5):
            expired = True
    except Exception:
        expired = False
    if expired:
        drop.items = []
        try:
            drop.save(update_fields=['items'])
        except Exception:
            drop.save()
        return JsonResponse({"code": code, "items": [], "expired": True})
    return JsonResponse({"code": code, "items": drop.items or []})


@login_required
def sharedrop_receive(request: HttpRequest) -> JsonResponse:
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    # Accept sender identifier as username or 'username:code' or just code+username fields
    sender_user = request.POST.get('username', '').strip()
    code = request.POST.get('code', '').strip() or 'default'
    if not sender_user:
        return JsonResponse({"error": "Username required"}, status=400)
    User = get_user_model()
    try:
        owner = User.objects.get(username=sender_user)
    except User.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)
    try:
        drop = SharedDrop.objects.get(user=owner, code=code)
    except SharedDrop.DoesNotExist:
        return JsonResponse({"error": "No shared items for that code"}, status=404)
    # Expire after 5 minutes
    if drop.updated_at and (datetime.now(timezone.utc) - drop.updated_at) > timedelta(minutes=5):
        return JsonResponse({"error": "Shared items expired"}, status=410)
    # Save items into receiver's FS under /Shared/<username>/
    base = f"/Shared/{owner.username}"
    UserFile.objects.get_or_create(user=request.user, path=base+'/', is_dir=True)
    import base64
    saved = []
    for it in (drop.items or []):
        name = str(it.get('name','')).strip() or 'item'
        content = it.get('content','')
        is_b64 = bool(it.get('is_base64'))
        full = f"{base}/{name}"
        uf, _ = UserFile.objects.get_or_create(user=request.user, path=full, defaults={"is_dir": False})
        if is_b64:
            # store with B64: prefix
            uf.content = 'B64:' + content
        else:
            uf.content = content
        uf.is_dir = False
        uf.save()
        saved.append(full)
    # Record history for receiver
    try:
        st,_ = UserState.objects.get_or_create(user=request.user)
        payload = st.state_json if isinstance(st.state_json, dict) else {}
        hist = payload.get('sharedrop_history') or []
        now = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M')
        for path in saved:
            nm = path.split('/')[-1]
            hist.insert(0, {"dir":"received","name":nm,"code":code,"when":now})
        payload['sharedrop_history'] = hist[:200]
        st.state_json = payload
        st.save(update_fields=['state_json'])
    except Exception:
        pass
    return JsonResponse({"ok": True, "saved": saved})


@login_required
def sharedrop_history(request: HttpRequest) -> JsonResponse:
    try:
        st,_ = UserState.objects.get_or_create(user=request.user)
        items = (st.state_json or {}).get('sharedrop_history') or []
    except Exception:
        items = []
    return JsonResponse({"items": items})


# Minimal proxy to load external pages into iframe when sites refuse embedding.
# Default posture: allow public internet hosts, but BLOCK private/local networks and unsafe schemes to prevent SSRF.
# We still keep an allowlist for convenience, but it's no longer a hard requirement.
ALLOWED_PROXY_HOSTS = {
    'en.m.wikipedia.org',
    'wikipedia.org',
    'news.ycombinator.com',
    'developer.mozilla.org',
    'docs.python.org',
    'example.com',
    'www.google.com', 'google.com',
    'www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be',
}

def _is_blocked_host(host: str) -> bool:
    """Return True if host should be blocked (private/local/unsafe)."""
    try:
        host = (host or '').strip().lower()
        if not host:
            return True
        # Obvious local names
        if host in {'localhost', 'localhost.localdomain'}:
            return True
        if host.endswith('.local') or host.endswith('.localhost') or host.endswith('.home') or host.endswith('.lan'):
            return True
        # IP checks
        import ipaddress
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
                return True
            return False
        except ValueError:
            # Not an IP, allow domains with a dot. Single-label hosts are suspicious (often local)
            if '.' not in host:
                return True
            return False
    except Exception:
        return True

@login_required
@csrf_exempt
def proxy(request: HttpRequest) -> HttpResponse:
    target = request.GET.get('url')
    if not target:
        return HttpResponse('Missing url', status=400)
    parsed = urllib.parse.urlparse(target)
    asset_mode = request.GET.get('asset') == '1'
    # Build dynamic allowlist: include hosts from installed proxy-enabled PWAs
    dyn_hosts = set()
    try:
        for url in App.objects.filter(is_enabled=True, kind='pwa', use_proxy=True).values_list('launch_url', flat=True):
            if not url:
                continue
            try:
                h = urllib.parse.urlparse(url).hostname
                if h:
                    dyn_hosts.add(h)
            except Exception:
                pass
    except Exception:
        pass
    allowed_hosts = set(ALLOWED_PROXY_HOSTS)
    # Add www/non-www variants for convenience
    for h in list(dyn_hosts):
        allowed_hosts.add(h)
        if h.startswith('www.'):
            allowed_hosts.add(h[4:])
        else:
            allowed_hosts.add('www.' + h)
    # Security gate: block clearly unsafe targets; otherwise allow. Keep explicit allowlist always allowed.
    host = (parsed.hostname or '').lower()
    if not asset_mode:
        scheme = (parsed.scheme or '').lower()
        if scheme not in {'http', 'https'}:
            return HttpResponse('Scheme not allowed', status=400)
        if host not in allowed_hosts and _is_blocked_host(host):
            return HttpResponse('Host not allowed', status=403)
    # Special-case YouTube watch/short/shorts links -> embed player
    try:
        if parsed.hostname in {'www.youtube.com','youtube.com','m.youtube.com'}:
            qs = urllib.parse.parse_qs(parsed.query)
            vid = (qs.get('v') or [None])[0]
            if (parsed.path or '').startswith('/shorts/'):
                vid = parsed.path.split('/shorts/',1)[1].split('/')[0]
            if not vid and parsed.path == '/watch':
                # already handled above via qs
                pass
            if vid:
                target = f"https://www.youtube.com/embed/{vid}"
                parsed = urllib.parse.urlparse(target)
        elif parsed.hostname == 'youtu.be':
            vid = parsed.path.strip('/')
            if vid:
                target = f"https://www.youtube.com/embed/{vid}"
                parsed = urllib.parse.urlparse(target)
    except Exception:
        pass
    try:
        # Build Cookie header from per-user cookie jar stored in UserState.state_json['proxy_cookies']
        headers = {'User-Agent': 'Mozilla/5.0 WebOS/1.0'}
        # Preserve content headers for POST/PUT/PATCH and forward Accept
        try:
            if request.method in {'POST', 'PUT', 'PATCH'}:
                ct = request.headers.get('Content-Type') or request.META.get('CONTENT_TYPE')
                if ct:
                    headers['Content-Type'] = ct
            accept = request.headers.get('Accept')
            if accept:
                headers['Accept'] = accept
        except Exception:
            pass
        try:
            st, _ = UserState.objects.get_or_create(user=request.user)
            jar = (st.state_json or {}).get('proxy_cookies', {}) or {}
            host = (parsed.hostname or '').lower()
            def domains_for(h: str):
                parts = (h or '').split('.')
                acc = set()
                for i in range(len(parts)-1):
                    acc.add('.'.join(parts[i:]))
                return acc
            allowed_domains = domains_for(host)
            cookie_pairs = []
            for dom, pairs in (jar.items() if isinstance(jar, dict) else []):
                if (dom or '').lower().lstrip('.') in allowed_domains or (dom or '').lower().lstrip('.') == host:
                    for name, val in (pairs or {}).items():
                        if name and val is not None:
                            cookie_pairs.append(f"{name}={val}")
            if cookie_pairs:
                headers['Cookie'] = '; '.join(cookie_pairs)
        except Exception:
            pass
        # Forward helpful headers for compatibility
        try:
            accept_lang = request.headers.get('Accept-Language')
            if accept_lang:
                headers['Accept-Language'] = accept_lang
            # Set Referer to the original target URL for sites that require it
            if target:
                headers['Referer'] = target
            # Supply Origin for CORS/CSRF checks on POST-like methods
            if request.method.upper() in {'POST','PUT','PATCH'} and parsed.scheme and parsed.netloc:
                headers['Origin'] = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass
        # Forward method and body when applicable
        data = None
        method = request.method.upper()
        if method in {'POST', 'PUT', 'PATCH'}:
            try:
                data = request.body
            except Exception:
                data = None
        # Build request and fetch; add timeouts
        try:
            req = urllib.request.Request(target, data=data, headers=headers, method=method)
        except TypeError:
            # Older Python without 'method' kwarg: rely on POST when data present
            req = urllib.request.Request(target, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read()
            content_type = resp.headers.get('Content-Type','text/html')
            if asset_mode:
                # Pass-through for assets (images/icons/fonts) without HTML rewrite or sanitize
                r = HttpResponse(body, content_type=content_type)
                r['X-Frame-Options'] = 'ALLOWALL'
                r['Content-Security-Policy'] = "frame-ancestors *"
                return r
            # Capture Set-Cookie headers for persistence
            try:
                set_cookies = resp.headers.get_all('Set-Cookie') if hasattr(resp.headers, 'get_all') else resp.headers.get('Set-Cookie')
            except Exception:
                set_cookies = None
            # If HTML, inject <base href> to fix relative URLs and optionally sanitize
            if 'text/html' in content_type.lower():
                try:
                    text = body.decode('utf-8', errors='ignore')
                    base = f"{parsed.scheme}://{parsed.netloc}"
                    # Optional sanitize: strip scripts and some meta tags to reduce frame-busting
                    sanitize = request.GET.get('sanitize') == '1'
                    rewrite = request.GET.get('rewrite') == '1'
                    # For Google domains, avoid sanitize by default even if requested (they rely on inline scripts heavily)
                    try:
                        host = parsed.hostname.lower()
                        # Match any google.* TLD (e.g., google.co.in, google.co.uk)
                        if host and re.search(r'(?:^|\.)google\.', host):
                            sanitize = False
                    except Exception:
                        pass
                    if sanitize:
                        # remove script tags
                        text = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', text, flags=re.IGNORECASE)
                        # remove http-equiv refresh/frame-related meta
                        text = re.sub(r'<meta[^>]+http-equiv=["\']?refresh[^>]*>', '', text, flags=re.IGNORECASE)
                        # strip inline onload/onerror handlers (basic)
                        text = re.sub(r' on(load|error)="[^"]*"', '', text, flags=re.IGNORECASE)
                    # Ensure a <base> tag is present for resolving relative URLs
                    if re.search(r'(?i)<head[^>]*>', text):
                        text = re.sub(r'(?i)<head([^>]*)>', lambda m: f"<head{m.group(1)}><base href=\"{base}/\">", text, count=1)
                    else:
                        text = f"<base href=\"{base}/\">" + text
                    # Inject a small network shim to route fetch/XHR/window.open via proxy (avoids direct external hits)
                    if re.search(r'(?i)<head[^>]*>', text):
                        shim = (
                            "<script>(function(){try{\n"
                            "var qs=new URLSearchParams(location.search);var san=qs.get('sanitize')||'0';var p=location.pathname;\n"
                            "function prox(u){try{var abs=new URL(u,document.baseURI).href;return p+'?rewrite=1&sanitize='+san+'&url='+encodeURIComponent(abs);}catch(e){return u;}}\n"
                            "// Intercept anchor clicks to keep navigation within proxy\n"
                            "document.addEventListener('click',function(e){try{var a=e.target && e.target.closest && e.target.closest('a[href]');if(!a) return; var href=a.getAttribute('href')||''; if(href.charAt(0)==='#') return; e.preventDefault(); var url=a.href||href; if(a.target && a.target!=='_self'){window.open(prox(url), a.target);} else {location.assign(prox(url));}}catch(err){}}, true);\n"
                            "// fetch/XHR/open -> proxied\n"
                            "var of=window.fetch;if(of){window.fetch=function(input,init){try{var url=(typeof input==='string')?input:(input&&input.url)||String(input);return of.call(this,prox(url),init);}catch(e){return of.call(this,input,init);}}}\n"
                            "var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,a,u1,pw){try{return xo.call(this,m,prox(u),a,u1,pw);}catch(e){return xo.call(this,m,u,a,u1,pw);}};\n"
                            "var wo=window.open;if(wo){window.open=function(u,n,s){try{return wo.call(window,prox(u),n,s);}catch(e){return wo.call(window,u,n,s);}}}\n"
                            "// History SPA navigations -> keep proxied\n"
                            "try{var hp=history.pushState;history.pushState=function(s,t,u){try{if(u!=null){u=prox(u);} }catch(e){} return hp.apply(this,arguments);} }catch(e){}\n"
                            "try{var hr=history.replaceState;history.replaceState=function(s,t,u){try{if(u!=null){u=prox(u);} }catch(e){} return hr.apply(this,arguments);} }catch(e){}\n"
                            "// Location navigations -> proxied\n"
                            "try{var la=location.assign;location.assign=function(u){try{u=prox(u);}catch(e){} return la.call(location,u);}}catch(e){}\n"
                            "try{var lr=location.replace;location.replace=function(u){try{u=prox(u);}catch(e){} return lr.call(location,u);}}catch(e){}\n"
                            "try{Object.defineProperty(location,'href',{get:function(){return this.toString();},set:function(v){try{v=prox(v);}catch(e){} return location.assign(v);}});}catch(e){}\n"
                            "// Programmatic form submit: rewrite action\n"
                            "try{var fps=HTMLFormElement.prototype.submit;HTMLFormElement.prototype.submit=function(){try{if(this && this.action){this.action=prox(this.action);} }catch(e){} return fps.call(this);}}catch(e){}\n"
                            "// User-initiated form submit: intercept and rewrite action\n"
                            "document.addEventListener('submit',function(e){try{var f=e.target; if(f && f.action){f.action = prox(f.action);} }catch(err){}}, true);\n"
                            "// Back/forward from host shell\n"
                            "window.addEventListener('message',function(ev){try{var d=ev.data||{};if(d.type==='webos:navigate'){if(d.action==='back'){history.back();}else if(d.action==='forward'){history.forward();}}}catch(e){}});\n"
                            "}catch(e){}})();</script>"
                        )
                        text = re.sub(r'(?i)(<head[^>]*>)', r"\1" + shim, text, count=1)
                    if rewrite:
                        # Rewrite common src/href/action URLs to pass back through this proxy
                        def prox(url):
                            if not url or url.startswith('data:'):
                                return url
                            # make absolute
                            absu = urllib.parse.urljoin(base+'/', url)
                            return f"{request.build_absolute_uri(request.path)}?rewrite=1&sanitize={'1' if sanitize else '0'}&url={urllib.parse.quote(absu, safe='')}"
                        def repl_attr(m):
                            # m: 1=attr name, 2=quote, 3=url
                            attr, q, u = m.group(1), m.group(2), m.group(3)
                            return f"{attr}={q}{prox(u)}{q}"
                        # href/src/action attributes (preserve quotes exactly once)
                        text = re.sub(r'(?i)(href|src|action)\s*=\s*(["\'])(.*?)\2', repl_attr, text)
                        # Also rewrite URLs inside inline styles: url(...)
                        def repl_css_url(m):
                            q = m.group(1) or ''
                            u = (m.group(2) or '').strip().strip('"\'')
                            return f"url({q}{prox(u)}{q})"
                        text = re.sub(r"url\((['\"]?)([^)]+)\)", repl_css_url, text, flags=re.IGNORECASE)
                    body = text.encode('utf-8')
                except Exception:
                    pass
            elif 'text/css' in content_type.lower():
                # Rewrite url(...) and @import in CSS to run through proxy
                try:
                    css = body.decode('utf-8', errors='ignore')
                    base = f"{parsed.scheme}://{parsed.netloc}"
                    sanitize = request.GET.get('sanitize') == '1'
                    rewrite = request.GET.get('rewrite') == '1'
                    if rewrite:
                        def prox(url):
                            if not url or url.startswith('data:'):
                                return url
                            absu = urllib.parse.urljoin(base+'/', url)
                            return f"{request.build_absolute_uri(request.path)}?rewrite=1&sanitize={'1' if sanitize else '0'}&url={urllib.parse.quote(absu, safe='')}"
                        def repl_css_url(m):
                            q = m.group(1) or ''
                            u = (m.group(2) or '').strip().strip('"\'')
                            return f"url({q}{prox(u)}{q})"
                        css = re.sub(r"url\((['\"]?)([^)]+)\)", repl_css_url, css, flags=re.IGNORECASE)
                        # @import url(...) pattern
                        def repl_import_url(m):
                            q = m.group(1) or ''
                            u = (m.group(2) or '').strip().strip("'\"")
                            return f"@import url({q}{prox(u)}{q})"
                        css = re.sub(r"@import\s+url\((['\"]?)([^)]+)\)\s*;?", repl_import_url, css, flags=re.IGNORECASE)
                        # @import "..." pattern
                        def repl_import_str(m):
                            q = m.group(1)
                            u = (m.group(2) or '').strip()
                            return f"@import {q}{prox(u)}{q}"
                        css = re.sub(r"@import\s+(['\"])([^'\"]+)\1\s*;?", repl_import_str, css, flags=re.IGNORECASE)
                    body = css.encode('utf-8')
                except Exception:
                    pass
            # Basic CSP relax so it can render in our iframe
            r = HttpResponse(body, content_type=content_type)
            r['X-Frame-Options'] = 'ALLOWALL'
            r['Content-Security-Policy'] = "frame-ancestors *"
            # Persist cookies from upstream response into user's cookie jar
            try:
                if set_cookies:
                    st, _ = UserState.objects.get_or_create(user=request.user)
                    payload = st.state_json if isinstance(st.state_json, dict) else {}
                    jar = payload.get('proxy_cookies') or {}
                    if isinstance(set_cookies, str):
                        set_cookies = [set_cookies]
                    for sc in set_cookies:
                        try:
                            c = SimpleCookie()
                            c.load(sc)
                            for name, morsel in c.items():
                                dom = (morsel['domain'] or parsed.hostname or '').lower().lstrip('.')
                                if not dom:
                                    continue
                                jar.setdefault(dom, {})[name] = morsel.value
                        except Exception:
                            continue
                    payload['proxy_cookies'] = jar
                    st.state_json = payload
                    st.save(update_fields=['state_json'])
            except Exception:
                pass
            return r
    except Exception as e:
        return HttpResponse(f'Proxy error: {e}', status=502)


@login_required
def app_html(request: HttpRequest, slug: str) -> HttpResponse:
    """Render a static HTML app template by slug under webos/apps/{slug}.html"""
    template_name = f"webos/apps/{slug}.html"
    try:
        return render(request, template_name)
    except Exception:
        return HttpResponse(f"App template not found: {template_name}", status=404)


# Account API: GET returns current user info; POST updates username/email/phone or 'about' in user state
@login_required
@require_http_methods(["GET", "POST"])
def account_api(request: HttpRequest) -> JsonResponse:
    User = get_user_model()
    user = request.user
    if request.method == 'GET':
        # include avatar (base64 data URL) if present in user state
        st, _ = UserState.objects.get_or_create(user=user)
        avatar = None
        about = None
        try:
            avatar = (st.state_json or {}).get('avatar')
            about = (st.state_json or {}).get('about')
        except Exception:
            avatar = None
        return JsonResponse({"username": user.username, "email": user.email, "phone": getattr(user, 'phone', ''), "avatar": avatar, "about": about})
    # POST -> update
    username = (request.POST.get('username') or '').strip()
    email = (request.POST.get('email') or '').strip()
    phone = (request.POST.get('phone') or '').strip()
    about = request.POST.get('about')
    # If only About is being updated, don't require username/email/phone
    if (username == '' and email == '' and phone == '' and about is not None):
        st, _ = UserState.objects.get_or_create(user=user)
        payload = st.state_json if isinstance(st.state_json, dict) else {}
        payload['about'] = str(about)
        st.state_json = payload
        st.save(update_fields=['state_json'])
        return JsonResponse({"ok": True, "about": payload['about']})
    # Basic validation
    if not username:
        return JsonResponse({"error": "Username required"}, status=400)
    # Ensure uniqueness for email and phone if they changed
    if email and User.objects.exclude(pk=user.pk).filter(email=email).exists():
        return JsonResponse({"error": "Email already in use"}, status=400)
    if phone and User.objects.exclude(pk=user.pk).filter(phone=phone).exists():
        return JsonResponse({"error": "Phone already in use"}, status=400)
    # Update fields (username immutable)
    if username != user.username:
        return JsonResponse({"error": "Username cannot be changed"}, status=400)
    user.email = email
    if hasattr(user, 'phone'):
        user.phone = phone
    user.save()
    return JsonResponse({"ok": True, "username": user.username, "email": user.email, "phone": getattr(user, 'phone', '')})


@login_required
@require_http_methods(["GET", "POST"])
def presence_heartbeat(request: HttpRequest) -> JsonResponse:
    """Record user's presence 'last_seen' timestamp in UserState.state_json.
    GET or POST will update the timestamp to 'now' (epoch seconds)."""
    try:
        st, _ = UserState.objects.get_or_create(user=request.user)
        payload = st.state_json if isinstance(st.state_json, dict) else {}
        import time
        now = int(time.time())
        payload['last_seen'] = now
        st.state_json = payload
        st.save(update_fields=['state_json'])
        return JsonResponse({"ok": True, "now": now})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def account_avatar(request: HttpRequest) -> JsonResponse:
    """Upload and set profile avatar image. Expects multipart with 'file'. Stored as data URL in UserState.avatar."""
    f = request.FILES.get('file')
    if not f:
        return JsonResponse({"error": "No file"}, status=400)
    data = f.read()
    import base64
    b64 = base64.b64encode(data).decode('ascii')
    mime = f.content_type or 'image/png'
    data_url = f"data:{mime};base64,{b64}"
    st, _ = UserState.objects.get_or_create(user=request.user)
    payload = st.state_json if isinstance(st.state_json, dict) else {}
    payload['avatar'] = data_url
    st.state_json = payload
    st.save()
    return JsonResponse({"ok": True, "avatar": data_url})


@login_required
@require_http_methods(["POST"])
def account_password(request: HttpRequest) -> JsonResponse:
    """Change password: expects current_password, new_password."""
    current = request.POST.get('current_password','')
    new = request.POST.get('new_password','')
    if not current or not new:
        return JsonResponse({"error": "current_password and new_password required"}, status=400)
    user = request.user
    if not user.check_password(current):
        return JsonResponse({"error": "Current password is incorrect"}, status=400)
    try:
        validate_password(new, user)
    except Exception as e:
        return JsonResponse({"error": "; ".join([str(x) for x in (e.messages if hasattr(e,'messages') else [str(e)])])}, status=400)
    user.set_password(new)
    user.save()
    # keep user logged in
    try:
        update_session_auth_hash(request, user)
    except Exception:
        pass
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def premium_buy(request: HttpRequest) -> JsonResponse:
    """Pretend to buy premium (20 INR/month). Upgrades plan to 'premium'."""
    st, _ = UserState.objects.get_or_create(user=request.user)
    payload = st.state_json if isinstance(st.state_json, dict) else {}
    payload['plan'] = 'premium'
    st.state_json = payload
    st.save()
    return JsonResponse({"ok": True, "plan": 'premium'})
