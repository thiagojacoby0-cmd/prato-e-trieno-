import fs from 'node:fs';
import path from 'node:path';

const configuredDataDir = process.env.DATA_DIR?.trim();
const configuredUploadsDir = process.env.UPLOADS_DIR?.trim();
const configuredBackupsDir = process.env.BACKUPS_DIR?.trim();

export const DATA_DIR = configuredDataDir
  ? path.resolve(configuredDataDir)
  : path.resolve(process.cwd(), 'data');

export const UPLOADS_DIR = configuredUploadsDir
  ? path.resolve(configuredUploadsDir)
  : configuredDataDir
    ? path.join(DATA_DIR, 'uploads')
    : path.resolve(process.cwd(), 'uploads');

export const BACKUPS_DIR = configuredBackupsDir
  ? path.resolve(configuredBackupsDir)
  : path.join(DATA_DIR, 'backups');

export function ensureAppDirectories(): void {
  for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureAppDirectories();
