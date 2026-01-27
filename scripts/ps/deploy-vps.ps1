# scripts/ps/deploy-vps.ps1
# Запускать НА WINDOWS: деплой на VPS (git pull -> npm ci -> pm2 restart)

$ErrorActionPreference = "Stop"

$Server = "root@185.130.212.232"
$ProjectPath = "/root/bot"
$Pm2Name = "hairbot"

# Команды, которые выполняются на сервере (bash)
$RemoteScript = @"
set -e
cd "$ProjectPath"
git pull
npm ci
pm2 restart "$Pm2Name"
pm2 save
echo "✅ Done"
"@

# Самый устойчивый способ: передать bash-скрипт по stdin
$RemoteScript | ssh $Server "bash -s"

