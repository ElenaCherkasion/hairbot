#!/bin/bash
# 🔄 Безопасная синхронизация новых переменных

echo "🔄 Проверяю новые переменные из .env.example..."

# Создаём временные файлы без комментариев
grep -v '^#' .env.example | grep -v '^$' > /tmp/env_example_clean
grep -v '^#' .env | grep -v '^$' > /tmp/env_current_clean

# Ищем ТОЛЬКО НОВЫЕ переменные (которых нет в текущем .env)
NEW_VARS=()

while IFS='=' read -r key default_value; do
  if ! grep -q "^${key}=" /tmp/env_current_clean; then
    NEW_VARS+=("$key")
    echo "📝 Найдена новая переменная: $key"
  fi
done < /tmp/env_example_clean

# Если есть новые переменные
if [ ${#NEW_VARS[@]} -gt 0 ]; then
  echo "🆕 Добавляю ${#NEW_VARS[@]} новых переменных..."
  
  for key in "${NEW_VARS[@]}"; do
    # Получаем значение по умолчанию из .env.example
    default_value=$(grep "^${key}=" /tmp/env_example_clean | cut -d'=' -f2-)
    
    # Ищем значение в GitHub Secrets (через переменные окружения)
    # Если нет - используем значение по умолчанию
    secret_value="${!key:-$default_value}"
    
    # Добавляем в .env
    echo "${key}=${secret_value}" >> .env
    echo "   ➕ $key=$secret_value"
  done
  
  # Перезапускаем бота
  echo "🔄 Перезапускаю бота..."
  pm2 restart hairbot 2>/dev/null || true
  echo "✅ Готово! Бот перезапущен."
else
  echo "✅ Новых переменных не найдено."
fi

# Очистка
rm -f /tmp/env_example_clean /tmp/env_current_clean
