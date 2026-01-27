# scripts/ps/deploy-vps.ps1
# Запускать НА WINDOWS: деплой на VPS (git pull -> npm ci -> pm2 restart)

$ErrorActionPreference = "Stop"

$Server = "root@185.130.212.232"
$ProjectPath = "/root/bot"
$Pm2Name = "hairbot"

# Одна строка для bash, чтобы не было CRLF-ломания
$RemoteCmd = "set -e; cd $ProjectPath; git pull; npm ci; pm2 restart $Pm2Name; pm2 save; echo ? Done"

ssh $Server "bash -lc '$RemoteCmd'"