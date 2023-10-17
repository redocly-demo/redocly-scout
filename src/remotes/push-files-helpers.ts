import { File } from 'buffer';
import fs from 'node:fs/promises';
import { basename, join, relative } from 'path';
import { DefinitionUploadTarget } from '../api-definitions/types';

const IGNORE_FILE_ENTRIES = ['.git'];

export async function getUploadTargetGroupFilesMap(
  uploadTargets: DefinitionUploadTarget[],
): Promise<Record<string, File>> {
  const files: Record<string, File> = {};

  for (const target of uploadTargets) {
    Object.assign(files, await getUploadTargetFilesMap(target));
  }

  return files;
}

async function getUploadTargetFilesMap(
  uploadTarget: DefinitionUploadTarget,
): Promise<Record<string, File>> {
  switch (uploadTarget.type) {
    case 'file':
      const buffer = await fs.readFile(uploadTarget.sourcePath);
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

async function getFolderFilesMap({
  folderPath,
  rootPath,
  targetPath,
}: {
  folderPath: string;
  rootPath: string;
  targetPath: string;
}): Promise<Record<string, File>> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const files: Record<string, File> = {};

  for (const entry of entries) {
    if (IGNORE_FILE_ENTRIES.includes(entry.name)) {
      continue;
    }
    const entryPath = join(folderPath, entry.name);
    if (entry.isFile()) {
      const buffer = await fs.readFile(entryPath);
      const path = join(targetPath, relative(rootPath, entryPath));
      files[path] = new File([buffer], entry.name);
    } else if (entry.isDirectory()) {
      Object.assign(
        files,
        await getFolderFilesMap({
          folderPath: entryPath,
          rootPath,
          targetPath,
        }),
      );
    }
  }

  return files;
}
