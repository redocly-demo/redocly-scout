import { Injectable, Logger } from '@nestjs/common';
import {
  ApiDefinitionMetadata,
  DefinitionDiscoveryResult,
  DefinitionUploadTarget,
  DiscoveredDefinition,
  OpenApiDefinition,
  RedoclyConfig,
  UploadTargetConfig,
  UploadTargetDestination,
  UploadTargetType,
} from './types';
import { basename, dirname, join, relative } from 'path';
import fs from 'fs';
import { load } from 'js-yaml';
import { ScoutJob } from '../jobs/types';
import { getValueByPath } from '../remotes/get-value-by-path';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';

const REDOCLY_CONFIG_FILENAME = 'redocly.yaml';
const OPENAPI_DEFINITION_EXTENSIONS = ['json', 'yaml', 'yml'];

@Injectable()
export class ApiDefinitionsService {
  private readonly logger = new Logger(ApiDefinitionsService.name);

  constructor(private config: ConfigService<ConfigSchema>) {}

  discoverApiDefinitions(
    rootPath: string,
    apiFolder: string,
  ): DefinitionDiscoveryResult {
    const apiFolderPath = join(rootPath, apiFolder);
    let hasRedoclyConfig = false;

    if (!fs.existsSync(apiFolderPath)) {
      return { isApiFolderMissing: true, hasRedoclyConfig, definitions: [] };
    }

    const files = this.getFilesList(apiFolderPath);
    const definitions = new Map<string, DiscoveredDefinition>();

    for (const filePath of files) {
      if (this.isRedoclyConfig(filePath)) {
        hasRedoclyConfig = true;
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

    return {
      isApiFolderMissing: false,
      hasRedoclyConfig,
      definitions: [...definitions.values()],
    };
  }

  convertToUploadTargets(
    definitions: DiscoveredDefinition[],
    job: ScoutJob,
    rootPath: string,
  ): DefinitionUploadTarget[] {
    const uploadTargets = new Map<string, DefinitionUploadTarget>();

    for (const definition of definitions) {
      const uploadTargetConfig = this.getUploadTargetConfig(
        definition,
        definitions,
        rootPath,
      );
      if (uploadTargetConfig) {
        const target = this.convertToUploadTarget({
          definition,
          job,
          ...uploadTargetConfig,
        });
        uploadTargets.set(uploadTargetConfig.path, target);
      }
    }

    return [...uploadTargets.values()].filter(
      (target, _, targets) => !this.hasParentUploadTarget(target, targets),
    );
  }

  private getUploadTargetConfig(
    definition: DiscoveredDefinition,
    definitions: DiscoveredDefinition[],
    rootPath: string,
  ): UploadTargetConfig | undefined {
    const definitionFolder = dirname(definition.path);
    if (this.isVersionedFolder(definitionFolder)) {
      const path = definitionFolder.split('@')[0] || '';
      // ignore versioned api folders in the root folder
      if (this.isRootFolder(relative(rootPath, path))) return;

      return { path, isVersioned: true, type: 'folder' };
    } else if (definition.path.endsWith(REDOCLY_CONFIG_FILENAME)) {
      return { path: definitionFolder, type: 'folder' };
    } else if (this.isMultiDefinitionsFolder(definitionFolder, definitions)) {
      return { path: definition.path, type: 'file' };
    } else {
      return { path: definitionFolder, type: 'folder' };
    }
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
    const rootMetadata = this.resolveMetadataRef(config.metadata, configPath);

    if (rootMetadata) {
      const configFolder = this.isVersionedFolder(configPath)
        ? configPath.split('@')[0] || ''
        : dirname(configPath);

      definitions.push({
        path: configPath,
        title: rootMetadata.title || basename(configFolder),
        metadata: rootMetadata,
      });
    }

    for (const api of apis) {
      const configApi = config?.apis?.[api];
      // try to get metadata from api level, otherwise check root metadata
      const apiMetadata = this.resolveMetadataRef(
        configApi?.metadata || rootMetadata,
        configPath,
      );
      if (apiMetadata && configApi?.root) {
        definitions.push({
          path: join(dirname(configPath), configApi.root),
          title: api,
          metadata: apiMetadata,
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
    const metadata = this.resolveMetadataRef(
      info?.['x-metadata'],
      definitionFilePath,
    );

    if (isOpenApi && metadata && info?.title) {
      return {
        path: definitionFilePath,
        title: info.title,
        metadata,
      };
    }
    return;
  }

  private convertToUploadTarget({
    definition,
    path,
    type,
    job,
    isVersioned = false,
  }: {
    definition: DiscoveredDefinition;
    path: string;
    type: UploadTargetType;
    job: ScoutJob;
    isVersioned?: boolean;
  }): DefinitionUploadTarget {
    const definitionTargetPath = this.getDefinitionTargetPath(definition, job);
    const { targetPath, remoteMountPath } = this.getUploadTargetDestination(
      definitionTargetPath,
      isVersioned,
    );

    return {
      sourcePath: path.replace(/\/$/, ''),
      targetPath,
      remoteMountPath,
      type,
      metadata: definition.metadata,
      title: definition.title,
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
      ({ sourcePath }) =>
        target.sourcePath !== sourcePath &&
        target.sourcePath.startsWith(sourcePath + '/'),
    );
  }

  private resolveMetadataRef(
    metadata: ApiDefinitionMetadata | undefined,
    definitionPath: string,
  ): ApiDefinitionMetadata | undefined {
    if (metadata?.$ref) {
      const refPath = join(dirname(definitionPath), metadata?.$ref);
      const refMetadata = this.parseFileByPath<ApiDefinitionMetadata>(refPath);
      // Handle nested refs
      return this.resolveMetadataRef(refMetadata, refPath);
    }

    return metadata;
  }

  private getDefinitionTargetPath(
    definition: DiscoveredDefinition,
    job: ScoutJob,
  ): string {
    const apiFolder = this.config.getOrThrow<string>(
      'REDOCLY_DEST_FOLDER_PATH',
    );
    const path = apiFolder
      .replace(/\{orgId}/g, job.namespaceId)
      .replace(/\{repoId}/g, job.repositoryId)
      .replace(/\{title}/g, definition.title)
      .replace(
        /{metadata\.(.+?)}/g,
        (_, path) =>
          getValueByPath(path, definition.metadata)?.toString() || '',
      );
    return path.replace(/^\//, '').replace(/\/$/, '');
  }

  private getUploadTargetDestination(
    definitionTargetPath: string,
    isVersioned: boolean,
  ): UploadTargetDestination {
    const targetPathParts = definitionTargetPath.split('/').filter(Boolean);
    // get last part of target path
    const definitionFolder = targetPathParts.slice(-1);
    // get path without the last part
    const remoteMountPath = targetPathParts.slice(0, -1).join('/');
    const targetPath = [
      ...definitionFolder,
      ...(isVersioned ? [] : ['@latest']),
    ].join('/');

    return { targetPath, remoteMountPath };
  }
}
