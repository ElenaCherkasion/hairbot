#!/bin/bash

set -e  # Выход при ошибке

echo "🚀 Начинаю синхронизацию .env переменных..."

cd /var/www/hairbot || exit 1

# 1. Backup текущего .env
if [ -f .env ]; then
    cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
    echo "💾 Backup .env создан"
else
    echo "⚠️  Файл .env не найден, создаю новый"
fi

# 2. Скачиваем .env.example с GitHub (через raw ссылку)
# Замените YOUR_USERNAME и YOUR_REPO на реальные значения
GITHUB_USER="hairbot-org"
GITHUB_REPO="hairbot"
BRANCH="main"

echo "📥 Загружаю .env.example с GitHub..."
curl -s -o .env.example.remote \
    "https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${BRANCH}/.env.example"

if [ ! -f .env.example.remote ]; then
    echo "❌ Не удалось загрузить .env.example с GitHub"
    exit 1
fi

# 3. Объединяем переменные
echo "🔧 Синхронизирую переменные..."

# Создаем или очищаем временный файл
> .env.new

# Обрабатываем каждую строку из удаленного .env.example
while IFS= read -r line || [[ -n "$line" ]]; do
    # Пропускаем комментарии и пустые строки
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    
    # Извлекаем имя переменной (до =)
    var_name=$(echo "$line" | cut -d= -f1)
    
    # Ищем значение в текущем .env
    if [ -f .env ] && grep -q "^${var_name}=" .env; then
        # Берем значение из существующего .env
        grep "^${var_name}=" .env >> .env.new
        echo "  📌 Сохранил существующее значение для: $var_name"
    else
        # Берем значение из .env.example
        echo "$line" >> .env.new
        echo "  ✅ Добавил новую переменную: $var_name"
    fi
done < .env.example.remote

# 4. Заменяем старый .env новым
mv .env.new .env
rm -f .env.example.remote

echo "✅ Синхронизация завершена!"
echo "📊 Обновленные переменные:"
grep -v '^#' .env | grep -v '^$'

# 5. Перезапускаем только если нужно (опционально)
# echo "🔄 Обновляю environment PM2..."
# pm2 restart hairbot --update-env
