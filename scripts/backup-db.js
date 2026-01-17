#!/usr/bin/env node
// scripts/backup-db.js

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Конфигурация
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 10; // Максимальное количество хранимых бэкапов

async function createBackup() {
  console.log('💾 Создание резервной копии базы данных...\n');
  
  // Создаем директорию для бэкапов, если не существует
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Создана директория: ${BACKUP_DIR}`);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.sql`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  
  try {
    // Получаем настройки базы данных из .env
    const dbUrl = process.env.DATABASE_URL || 'sqlite://./database/hairbot.db';
    
    if (dbUrl.includes('sqlite://')) {
      // Бэкап SQLite
      const dbPath = dbUrl.replace('sqlite://', '');
      const fullDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, '..', dbPath);
      
      if (fs.existsSync(fullDbPath)) {
        fs.copyFileSync(fullDbPath, backupPath.replace('.sql', '.db'));
        console.log(`✅ SQLite база данных скопирована: ${backupPath.replace('.sql', '.db')}`);
      } else {
        console.log(`⚠️  Файл базы данных не найден: ${fullDbPath}`);
        return false;
      }
    } else if (dbUrl.includes('mysql://')) {
      // Бэкап MySQL
      const url = new URL(dbUrl.replace('mysql://', 'mysql://'));
      const dbName = url.pathname.replace('/', '');
      
      const command = `mysqldump -h ${url.hostname} -P ${url.port || 3306} -u ${url.username} -p${url.password} ${dbName} > ${backupPath}`;
      
      await execAsync(command);
      console.log(`✅ MySQL бэкап создан: ${backupPath}`);
    } else if (dbUrl.includes('postgres://')) {
      // Бэкап PostgreSQL
      const command = `pg_dump ${dbUrl} > ${backupPath}`;
      await execAsync(command);
      console.log(`✅ PostgreSQL бэкап создан: ${backupPath}`);
    } else {
      console.log(`❌ Неподдерживаемый тип базы данных: ${dbUrl}`);
      return false;
    }
    
    // Очистка старых бэкапов
    await cleanupOldBackups();
    
    // Создаем README файл
    const readmePath = path.join(BACKUP_DIR, 'README.md');
    const readmeContent = `# Резервные копии базы данных

## Автоматические бэкапы
Бэкапы создаются автоматически при выполнении команды:
\`\`\`bash
npm run db:backup
\`\`\`

## Восстановление

### SQLite
\`\`\`bash
cp backups/backup-*.db database/hairbot.db
\`\`\`

### MySQL
\`\`\`bash
mysql -u user -p database_name < backup-*.sql
\`\`\`

### PostgreSQL
\`\`\`bash
psql database_name < backup-*.sql
\`\`\`

## Автоматизация
Для автоматического создания бэкапов добавьте в crontab:
\`\`\`
0 2 * * * cd /path/to/hairbot && npm run db:backup
\`\`\`
`;
    
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, readmeContent);
    }
    
    console.log('\n✅ Резервная копия успешно создана!');
    return true;
    
  } catch (error) {
    console.error('❌ Ошибка при создании бэкапа:', error.message);
    return false;
  }
}

async function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('backup-'))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      console.log(`🗑️  Удаление старых бэкапов (остается ${MAX_BACKUPS}):`);
      
      toDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`   Удален: ${file.name}`);
      });
    }
  } catch (error) {
    console.log('⚠️  Не удалось очистить старые бэкапы:', error.message);
  }
}

// Запуск бэкапа
if (process.argv.includes('--list')) {
  // Показать список бэкапов
  if (fs.existsSync(BACKUP_DIR)) {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('backup-'))
      .sort()
      .reverse();
    
    console.log('📋 Список резервных копий:');
    files.forEach((file, index) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, file));
      console.log(`${index + 1}. ${file} (${new Date(stats.mtime).toLocaleString()})`);
    });
  } else {
    console.log('Директория backups не существует');
  }
} else if (process.argv.includes('--restore')) {
  // Восстановление из бэкапа
  console.log('Функция восстановления еще не реализована');
} else {
  // Создание нового бэкапа
  createBackup();
}
