# OSProj Web-OS

This project provides a simple Web-OS experience (desktop, taskbar, start menu, draggable/resizable windows) inside a Django app. Users can launch built-in apps (Calculator, Notepad) and external PWAs, and their desktop state is saved so they can resume on any device after login.

## Features
- Desktop shell with taskbar, clock, start menu
- Window manager (drag, resize, minimize, maximize)
- Built-in apps: Calculator, Notepad (notes saved per user)
- External apps via URLs, opened in iframe windows
- Automatic persistence of open windows and layout per user

## Quick start
1. Install dependencies and run migrations
2. Create a superuser to add external apps (optional)
3. Run server and open the desktop at `/os/`

Commands (Windows PowerShell):

```
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Then visit http://localhost:8000/ and sign in. Authenticated users will be redirected to `/os/`.

## Adding apps
- Built-in HTML apps: create a template at `templates/webos/apps/<slug>.html`. It will be auto-launched using the path `/os/apps/html/<slug>`.
- Built-in mapped apps: add a route in `WEBOS_APPS` in `templates/webos/desktop.html` with a name and path.
- External PWA: add an entry in Admin under Web OS -> Apps with `kind=pwa` and a `launch_url`. It will show in the Start menu.

## Persistence
The shell saves `state` (open windows, positions, sizes, last app states if they use the bridge) in the `UserState` model. Save occurs debounced during interactions and on unload.

For external PWAs, full cookie migration is not possible due to browser security; however, if the PWA cooperates using `postMessage`, it can request/submit state:

```js
// Inside the app running in the iframe
window.parent.postMessage({ type: 'webos:getState' }, '*');
window.addEventListener('message', ev => {
	if (ev.data?.type === 'webos:state') {
		// ev.data.state holds the shell state; use a namespaced key
	}
});
// To save something
window.parent.postMessage({ type: 'webos:setState', state: { myApp: { ... } } }, '*');
```

Cookies for third-party PWAs are subject to cross-site restrictions; recommend using the bridge for critical state.

## Notes
- Development server only; use a proper WSGI/ASGI server in production.
- Consider CSP and X-Frame-Options if embedding external sites; by default, Django's middleware may block iframes. You may need to adjust security settings for specific trusted domains.
