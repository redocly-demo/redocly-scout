import { File } from 'buffer';
import fs from 'fs';
import { basename, join, relative } from 'path';
import { DefinitionUploadTarget } from '../api-definitions/types';

const IGNORE_FILE_ENTRIES = ['.git'];

export function getUploadTargetFilesMap(
  uploadTarget: DefinitionUploadTarget,
): Record<string, File> {
  switch (uploadTarget.type) {
    case 'file':
      const buffer = fs.readFileSync(uploadTarget.path);
      const file = new File([buffer], basename(uploadTarget.path));
      return { [basename(uploadTarget.path)]: file };
    case 'folder':
      return getFolderFilesMap(uploadTarget.path, uploadTarget.path);
  }
}

function getFolderFilesMap(
  folderPath: string,
  rootPath: string,
): Record<string, File> {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files: Record<string, File> = {};

  for (const entry of entries) {
    if (IGNORE_FILE_ENTRIES.includes(entry.name)) {
      continue;
    }
    const entryPath = join(folderPath, entry.name);
    if (entry.isFile()) {
      const buffer = fs.readFileSync(entryPath);
      files[relative(rootPath, entryPath)] = new File([buffer], entry.name);
    } else if (entry.isDirectory()) {
      Object.assign(files, getFolderFilesMap(entryPath, rootPath));
    }
  }

  return files;
}
