from django.db import migrations


def seed_apps(apps, schema_editor):
    App = apps.get_model('webos', 'App')
    def upsert(slug, name, kind='builtin', launch_url=None, icon=''):
        obj, _ = App.objects.update_or_create(slug=slug, defaults={
            'name': name,
            'kind': kind,
            'launch_url': launch_url,
            'icon': icon,
            'is_pinned': True,
            'is_enabled': True,
        })
        return obj

    upsert('calculator', 'Calculator')
    upsert('notepad', 'Notepad')
    upsert('explorer', 'File Explorer')
    upsert('settings', 'Settings')
    upsert('stopwatch', 'Stopwatch')
    # Example external PWA
    wiki = upsert('wikipedia', 'Wikipedia', kind='pwa', launch_url='https://en.m.wikipedia.org/')
    # default to use proxy for demo
    wiki.use_proxy = True
    wiki.save()


def unseed_apps(apps, schema_editor):
    App = apps.get_model('webos', 'App')
    App.objects.filter(slug__in=['calculator','notepad','explorer','settings','stopwatch','wikipedia']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('webos', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_apps, reverse_code=unseed_apps),
    ]
