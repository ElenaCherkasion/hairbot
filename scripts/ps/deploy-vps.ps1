# scripts/ps/deploy-vps.ps1
# Запускать НА WINDOWS: деплой на VPS (git pull -> npm ci -> pm2 restart)

$ErrorActionPreference = "Stop"

$Server = "root@185.130.212.232"
$ProjectPath = "/root/bot"
$Pm2Name = "hairbot"

# Важно: в non-interactive ssh nvm не доступен, поэтому явно подключаем его
$RemoteCmd = "set -e; export NVM_DIR=`"$HOME/.nvm`"; [ -s `$NVM_DIR/nvm.sh ] && . `$NVM_DIR/nvm.sh; nvm use 22; cd $ProjectPath; git pull; npm ci; pm2 restart $Pm2Name --update-env; pm2 save; echo Done"

ssh $Server $RemoteCmd