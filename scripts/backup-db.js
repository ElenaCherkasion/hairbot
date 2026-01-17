import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();
const execAsync = promisify(exec);

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = 'backups';
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
  
  try {
    const command = `mysqldump -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} > ${backupFile}`;
    
    await execAsync(command);
    console.log(`✅ Резервная копия создана: ${backupFile}`);
    
    // Удаляем старые бэкапы (оставляем последние 5)
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
      .sort()
      .reverse();
    
    if (files.length > 5) {
      for (const file of files.slice(5)) {
        fs.unlinkSync(path.join(backupDir, file));
        console.log(`🗑️ Удален старый бэкап: ${file}`);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка создания бэкапа:', error.message);
  }
}

backupDatabase();
