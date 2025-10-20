Place official Microsoft Fluent System Icons SVGs here under the following structure:

assets/
  <Icon Folder Name>/
    SVG/
      ic_fluent_<icon_name>_<size>_<style>.svg

Examples:
- assets/Apps List/SVG/ic_fluent_apps_list_20_regular.svg
- assets/Person/SVG/ic_fluent_person_20_regular.svg
- assets/Window/SVG/ic_fluent_window_20_regular.svg
- assets/Settings/SVG/ic_fluent_settings_20_regular.svg

Notes:
- The icon loader in /static/webos/js/icons.js will attempt to inline from this folder first.
- If a file is missing, it will fall back to the local lightweight icon drawings.
- No external network calls are required at runtime.
