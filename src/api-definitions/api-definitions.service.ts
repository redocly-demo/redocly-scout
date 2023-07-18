import { Injectable, Logger } from '@nestjs/common';
import {
  DefinitionUploadTarget,
  DiscoveredDefinition,
  OpenApiDefinition,
  RedoclyConfig,
  UploadTargetType,
} from './types';
import { basename, dirname, join, relative } from 'path';
import fs from 'fs';
import { load } from 'js-yaml';

const REDOCLY_CONFIG_FILENAME = 'redocly.yaml';
const OPENAPI_DEFINITION_EXTENSIONS = ['json', 'yaml', 'yml'];

@Injectable()
export class ApiDefinitionsService {
  private readonly logger = new Logger(ApiDefinitionsService.name);

  discoverApiDefinitions(
    rootPath: string,
    apiFolder: string,
  ): DiscoveredDefinition[] {
    const apiFolderPath = join(rootPath, apiFolder);

    if (!fs.existsSync(apiFolderPath)) {
      return [];
    }

    const files = this.getFilesList(apiFolderPath);
    const definitions = new Map<string, DiscoveredDefinition>();

    for (const filePath of files) {
      if (this.isRedoclyConfig(filePath)) {
        const configDefinitions = this.getDefinitionsFromConfigByPath(filePath);
        for (const definition of configDefinitions) {
          if (!definitions.has(definition.path)) {
            definitions.set(definition.path, definition);
          }
        }
      } else if (this.isOpenApiFileExt(filePath)) {
        const definition = this.parseDefinitionByPath(filePath);
        if (definition) {
          definitions.set(definition.path, definition);
        }
      }
    }

    return [...definitions.values()];
  }

  convertToUploadTargets(
    definitions: DiscoveredDefinition[],
    rootPath: string,
  ): DefinitionUploadTarget[] {
    const uploadTargets = new Map<string, DefinitionUploadTarget>();
    for (const definition of definitions) {
      const definitionFolder = dirname(definition.path);
      if (this.isVersionedFolder(definitionFolder)) {
        const path = definitionFolder.split('@')[0] || '';
        if (this.isRootFolder(relative(rootPath, path))) continue;

        const target = this.convertToUploadTarget(
          definition,
          path,
          'folder',
          true,
        );
        uploadTargets.set(path, target);
      } else if (definition.path.endsWith(REDOCLY_CONFIG_FILENAME)) {
        const path = definitionFolder;
        const target = this.convertToUploadTarget(definition, path, 'folder');
        uploadTargets.set(path, target);
      } else if (this.isMultiDefinitionsFolder(definitionFolder, definitions)) {
        const path = definition.path;
        const target = this.convertToUploadTarget(definition, path, 'file');
        uploadTargets.set(path, target);
      } else {
        const path = definitionFolder;
        const target = this.convertToUploadTarget(definition, path, 'folder');
        uploadTargets.set(path, target);
      }
    }

    return [...uploadTargets.values()].filter(
      (target, _, targets) => !this.hasParentUploadTarget(target, targets),
    );
  }

  private getFilesList(folderPath: string): string[] {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(join(folderPath, entry.name));
      } else if (entry.isDirectory()) {
        files.push(...this.getFilesList(join(folderPath, entry.name)));
      }
    }

    return files;
  }

  private isRedoclyConfig(filePath: string) {
    return basename(filePath) === REDOCLY_CONFIG_FILENAME;
  }

  private isOpenApiFileExt(filePath: string) {
    return OPENAPI_DEFINITION_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  }

  private getDefinitionsFromConfigByPath(
    configPath: string,
  ): DiscoveredDefinition[] {
    const config = this.parseFileByPath<RedoclyConfig>(configPath);

    if (!config) {
      return [];
    }

    const apis = Object.keys(config.apis || {});
    const definitions: DiscoveredDefinition[] = [];

    if (config.metadata) {
      const configFolder = this.isVersionedFolder(configPath)
        ? configPath.split('@')[0] || ''
        : dirname(configPath);

      definitions.push({
        path: configPath,
        title: config.metadata.title || basename(configFolder),
        metadata: config.metadata,
      });
    }

    for (const api of apis) {
      const configApi = config?.apis?.[api];
      // try to get metadata from api level, otherwise check root metadata
      const metadata = configApi?.metadata || config.metadata;
      if (metadata && configApi?.root) {
        definitions.push({
          path: join(dirname(configPath), configApi.root),
          title: api,
          metadata,
        });
      }
    }

    return definitions;
  }

  private parseDefinitionByPath(
    definitionFilePath: string,
  ): DiscoveredDefinition | undefined {
    const definition =
      this.parseFileByPath<OpenApiDefinition>(definitionFilePath);
    const isOpenApi = Boolean(definition?.openapi || definition?.swagger);
    const info = definition?.info;

    if (isOpenApi && info?.['x-metadata'] && info?.title) {
      return {
        path: definitionFilePath,
        title: info.title,
        metadata: info['x-metadata'],
      };
    }
    return;
  }

  private convertToUploadTarget(
    definition: DiscoveredDefinition,
    path: string,
    type: UploadTargetType,
    isVersioned = false,
  ): DefinitionUploadTarget {
    return {
      path: path.replace(/\/$/, ''),
      type,
      metadata: definition.metadata,
      title: definition.title,
      isVersioned,
    };
  }

  private isVersionedFolder(folderPath: string) {
    return folderPath.includes('@');
  }

  private isRootFolder(folderPath: string) {
    return folderPath === '' || ['.', '/'].includes(folderPath);
  }

  private isMultiDefinitionsFolder(
    folder: string,
    definitions: DiscoveredDefinition[],
  ): boolean {
    const folderDefinitions = definitions.filter(
      ({ path }) => dirname(path) === folder,
    );
    return folderDefinitions.length > 1;
  }

  private parseFileByPath<T>(filePath: string): T | undefined {
    try {
      const file = fs.readFileSync(filePath, 'utf8');
      return load(file) as T;
    } catch (err) {
      this.logger.warn(
        { err: new Error(err.message), filePath },
        'Unable to parse file',
      );
      return;
    }
  }

  private hasParentUploadTarget(
    target: DefinitionUploadTarget,
    targets: DefinitionUploadTarget[],
  ) {
    return targets.some(
      ({ path }) => target.path !== path && target.path.startsWith(path),
    );
  }
}
