import { File } from 'buffer';
import fs from 'fs';
import { basename, join, relative } from 'path';
import { DefinitionUploadTarget } from '../api-definitions/types';

const IGNORE_FILE_ENTRIES = ['.git'];

export function getUploadTargetGroupFilesMap(
  uploadTargets: DefinitionUploadTarget[],
): Record<string, File> {
  const files: Record<string, File> = {};

  for (const target of uploadTargets) {
    Object.assign(files, getUploadTargetFilesMap(target));
  }

  return files;
}

function getUploadTargetFilesMap(
  uploadTarget: DefinitionUploadTarget,
): Record<string, File> {
  switch (uploadTarget.type) {
    case 'file':
      const buffer = fs.readFileSync(uploadTarget.sourcePath);
      const file = new File([buffer], basename(uploadTarget.sourcePath));
      const path = join(
        uploadTarget.targetPath,
        basename(uploadTarget.sourcePath),
      );
      return { [path]: file };
    case 'folder':
      return getFolderFilesMap({
        folderPath: uploadTarget.sourcePath,
        rootPath: uploadTarget.sourcePath,
        targetPath: uploadTarget.targetPath,
      });
  }
}

function getFolderFilesMap({
  folderPath,
  rootPath,
  targetPath,
}: {
  folderPath: string;
  rootPath: string;
  targetPath: string;
}): Record<string, File> {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files: Record<string, File> = {};

  for (const entry of entries) {
    if (IGNORE_FILE_ENTRIES.includes(entry.name)) {
      continue;
    }
    const entryPath = join(folderPath, entry.name);
    if (entry.isFile()) {
      const buffer = fs.readFileSync(entryPath);
      const path = join(targetPath, relative(rootPath, entryPath));
      files[path] = new File([buffer], entry.name);
    } else if (entry.isDirectory()) {
      Object.assign(
        files,
        getFolderFilesMap({
          folderPath: entryPath,
          rootPath,
          targetPath,
        }),
      );
    }
  }

  return files;
}
