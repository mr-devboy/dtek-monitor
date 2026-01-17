# Интеграция с Home Assistant

Этот документ описывает, как триггерить DTEK monitor workflow при событиях из Home Assistant (например, когда пропадает свет).

## 🔑 Шаг 1: Создайте GitHub Personal Access Token

1. Откройте: https://github.com/settings/tokens/new
2. Имя: `Home Assistant DTEK Trigger`
3. Выберите срок действия: `No expiration` или на ваш выбор
4. Отметьте права:
   - ✅ `repo` (полный доступ к репозиториям)
5. Нажмите **Generate token**
6. **Скопируйте токен** (он больше не будет показан!)

## 📡 Шаг 2: Вызов workflow через API

### Вариант 1: Curl (для быстрого теста)

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/artjazz111/dtek-monitor/dispatches \
  -d '{"event_type":"power-outage-detected"}'
```

### Вариант 2: Node.js (для Telegram бота)

```javascript
async function triggerDTEKMonitor() {
  const response = await fetch(
    'https://api.github.com/repos/artjazz111/dtek-monitor/dispatches',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer YOUR_GITHUB_TOKEN',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'power-outage-detected'
      })
    }
  );

  if (response.status === 204) {
    console.log('✅ DTEK workflow triggered successfully!');
  } else {
    console.error('❌ Failed to trigger workflow:', await response.text());
  }
}

// Вызывайте эту функцию когда в Home Assistant пропал свет
triggerDTEKMonitor();
```

### Вариант 3: Python (для Home Assistant automation)

```python
import requests

def trigger_dtek_monitor():
    url = "https://api.github.com/repos/artjazz111/dtek-monitor/dispatches"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer YOUR_GITHUB_TOKEN",
    }
    data = {
        "event_type": "power-outage-detected"
    }

    response = requests.post(url, headers=headers, json=data)

    if response.status_code == 204:
        print("✅ DTEK workflow triggered successfully!")
    else:
        print(f"❌ Failed to trigger workflow: {response.text}")

# Вызывайте когда Home Assistant детектит отключение света
trigger_dtek_monitor()
```

## 🏠 Шаг 3: Настройка Home Assistant

### Automation пример:

```yaml
automation:
  - alias: "Trigger DTEK Monitor on Power Outage"
    trigger:
      - platform: state
        entity_id: binary_sensor.your_power_sensor
        to: "off"
    action:
      - service: shell_command.trigger_dtek_monitor

shell_command:
  trigger_dtek_monitor: >
    curl -X POST
    -H "Accept: application/vnd.github+json"
    -H "Authorization: Bearer YOUR_GITHUB_TOKEN"
    https://api.github.com/repos/artjazz111/dtek-monitor/dispatches
    -d '{"event_type":"power-outage-detected"}'
```

Замените:
- `binary_sensor.your_power_sensor` - на вашу сущность Home Assistant
- `YOUR_GITHUB_TOKEN` - на ваш GitHub Personal Access Token

## ✅ Проверка

После настройки:

1. **Тестовый вызов:** Выполните curl команду вручную
2. **Проверка:** Откройте https://github.com/artjazz111/dtek-monitor/actions
3. **Результат:** Workflow должен запуститься с триггером `repository_dispatch`

---

## 🔄 Итоговая схема работы:

1. **Расписание (каждые 10 минут):**
   - GitHub Actions автоматически проверяет ДТЕК
   - Отправляет уведомления при изменениях

2. **Home Assistant (когда пропал свет):**
   - Home Assistant детектит отключение света
   - Вызывает GitHub API
   - Запускает немедленную проверку ДТЕК
   - Получаете актуальную информацию сразу

## 🔐 Безопасность

⚠️ **ВАЖНО:** Храните GitHub Token в секрете!
- Не коммитьте токен в код
- Используйте переменные окружения
- В Home Assistant используйте `secrets.yaml`

Пример для `secrets.yaml`:
```yaml
github_token: ghp_your_token_here
```

Использование в automation:
```yaml
shell_command:
  trigger_dtek_monitor: >
    curl -X POST
    -H "Accept: application/vnd.github+json"
    -H "Authorization: Bearer !secret github_token"
    https://api.github.com/repos/artjazz111/dtek-monitor/dispatches
    -d '{"event_type":"power-outage-detected"}'
```
