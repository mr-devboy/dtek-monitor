# Настройка интеграции с Home Assistant

Этот гайд покажет как настроить получение данных об отключениях в Home Assistant.

## Шаг 1: Создание Webhook автоматизации в Home Assistant

1. Откройте **Settings → Automations & Scenes → Create Automation**

2. Выберите **"Start with an empty automation"**

3. Нажмите на три точки (⋮) → **Edit in YAML**

4. Вставьте следующую конфигурацию:

```yaml
alias: DTEK Power Outage Webhook
description: Получает данные об отключениях от GitHub Actions
trigger:
  - platform: webhook
    allowed_methods:
      - POST
    local_only: false
    webhook_id: dtek_outage_monitor
action:
  - service: input_text.set_value
    target:
      entity_id: input_text.dtek_outage_state
    data:
      value: "{{ trigger.json.state }}"
  - service: input_text.set_value
    target:
      entity_id: input_text.dtek_outage_start
    data:
      value: "{{ trigger.json.outage.start_date if trigger.json.state == 'outage' else '' }}"
  - service: input_text.set_value
    target:
      entity_id: input_text.dtek_outage_end
    data:
      value: "{{ trigger.json.outage.end_date if trigger.json.state == 'outage' else '' }}"
  - service: input_text.set_value
    target:
      entity_id: input_text.dtek_outage_reason
    data:
      value: "{{ trigger.json.outage.reason if trigger.json.state == 'outage' else '' }}"
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.state == 'outage' }}"
        sequence:
          - service: notify.telegram_bot
            data:
              message: |
                ⚡️ Зафіксовано відключення:

                📍 {{ trigger.json.city }}, {{ trigger.json.street }}, {{ trigger.json.house }}

                📋 Причина: {{ trigger.json.outage.reason }}
                ⏰ Час початку: {{ trigger.json.outage.start_date }}
                🔌 Орієнтовний час відновлення: до {{ trigger.json.outage.end_date }}
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.state == 'normal' }}"
        sequence:
          - service: notify.telegram_bot
            data:
              message: "✅ Електропостачання відновлено"
mode: single
```

5. Сохраните автоматизацию

## Шаг 2: Создание Input Text Helper'ов

Перейдите в **Settings → Devices & Services → Helpers** и создайте следующие Input Text:

1. **dtek_outage_state** - текущий статус (outage/normal)
2. **dtek_outage_start** - время начала отключения
3. **dtek_outage_end** - ориентировочное время восстановления
4. **dtek_outage_reason** - причина отключения

Или добавьте в `configuration.yaml`:

```yaml
input_text:
  dtek_outage_state:
    name: DTEK Статус відключення
    initial: normal

  dtek_outage_start:
    name: DTEK Час початку

  dtek_outage_end:
    name: DTEK Час відновлення

  dtek_outage_reason:
    name: DTEK Причина відключення
```

## Шаг 3: Получение Webhook URL

После создания автоматизации ваш webhook URL будет:

```
https://ВАШ_HA_URL/api/webhook/dtek_outage_monitor
```

Замените `ВАШ_HA_URL` на:
- Если доступ через Nabu Casa: `https://XXXXX.ui.nabu.casa`
- Если свой домен: `https://home.example.com`
- Если локально + DuckDNS: `https://yourname.duckdns.org`

## Шаг 4: Добавление URL в GitHub Secrets

1. Перейдите в ваш GitHub репозиторий:
   ```
   https://github.com/artjazz111/dtek-monitor/settings/secrets/actions
   ```

2. Нажмите **New repository secret**

3. Введите:
   - **Name**: `HA_WEBHOOK_URL`
   - **Secret**: `https://ВАШ_HA_URL/api/webhook/dtek_outage_monitor`

4. Нажмите **Add secret**

## Шаг 5: Настройка Telegram бота в Home Assistant

Если у вас еще не настроен Telegram бот в HA:

1. Создайте бота через [@BotFather](https://t.me/BotFather)

2. Добавьте в `configuration.yaml`:

```yaml
telegram_bot:
  - platform: polling
    api_key: YOUR_BOT_TOKEN
    allowed_chat_ids:
      - YOUR_CHAT_ID

notify:
  - name: telegram_bot
    platform: telegram
    chat_id: YOUR_CHAT_ID
```

3. Перезапустите Home Assistant

## Шаг 6: Создание карточки на Dashboard

Добавьте на ваш dashboard:

```yaml
type: entities
title: ДТЕК Моніторинг відключень
entities:
  - entity: input_text.dtek_outage_state
    name: Статус
  - entity: input_text.dtek_outage_start
    name: Початок
  - entity: input_text.dtek_outage_end
    name: Відновлення
  - entity: input_text.dtek_outage_reason
    name: Причина
```

Или используйте Markdown card для красивого отображения:

```yaml
type: markdown
title: ⚡️ ДТЕК Відключення
content: |
  {% if states('input_text.dtek_outage_state') == 'outage' %}
  🔴 **Зафіксовано відключення**

  **Причина:** {{ states('input_text.dtek_outage_reason') }}

  **Час початку:** {{ states('input_text.dtek_outage_start') }}

  **Відновлення:** до {{ states('input_text.dtek_outage_end') }}
  {% else %}
  🟢 **Електропостачання в нормі**
  {% endif %}
```

## Шаг 7: Создание Template Sensor (опционально)

Для использования в автоматизациях добавьте в `configuration.yaml`:

```yaml
template:
  - binary_sensor:
      - name: "ДТЕК Відключення"
        unique_id: dtek_power_outage
        state: "{{ states('input_text.dtek_outage_state') == 'outage' }}"
        device_class: power
        attributes:
          start_date: "{{ states('input_text.dtek_outage_start') }}"
          end_date: "{{ states('input_text.dtek_outage_end') }}"
          reason: "{{ states('input_text.dtek_outage_reason') }}"
```

Теперь вы сможете использовать `binary_sensor.dtek_vidklyuchennya` в автоматизациях!

## Пример автоматизации

Отправка уведомления когда обнаружено отключение:

```yaml
alias: Уведомление об отключении ДТЕК
trigger:
  - platform: state
    entity_id: binary_sensor.dtek_vidklyuchennya
    to: "on"
action:
  - service: notify.mobile_app_your_phone
    data:
      message: "⚡️ Відключення до {{ state_attr('binary_sensor.dtek_vidklyuchennya', 'end_date') }}"
      title: "ДТЕК: Зафіксовано відключення"
```

## Тестирование

После настройки запустите workflow вручную:
```
https://github.com/artjazz111/dtek-monitor/actions/workflows/monitor.yml
```

Проверьте логи workflow - должно быть:
```
🏠 Sending data to Home Assistant...
🟢 Data sent to Home Assistant.
```

## Troubleshooting

**Webhook не работает:**
- Проверьте что HA доступен извне (не только локально)
- Проверьте что webhook_id правильный в автоматизации
- Посмотрите логи HA: Settings → System → Logs

**Данные не обновляются:**
- Проверьте что input_text helper'ы созданы с правильными ID
- Проверьте что GitHub Secret `HA_WEBHOOK_URL` добавлен правильно

**Сертификат SSL ошибка:**
- Убедитесь что у вас валидный SSL сертификат (Let's Encrypt через DuckDNS или Nabu Casa)
