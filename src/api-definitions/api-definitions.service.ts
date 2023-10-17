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
import { basename, dirname, join, relative, extname } from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { load, dump } from 'js-yaml';
import { ScoutJob } from '../jobs/types';
import { getValueByPath } from '../remotes/get-value-by-path';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { DefinitionHooksService } from './definition-hooks.service';

export const REDOCLY_CONFIG_FILENAME = 'redocly.yaml';
export const OPENAPI_DEFINITION_EXTENSIONS = ['json', 'yaml', 'yml'];

@Injectable()
export class ApiDefinitionsService {
  private readonly logger = new Logger(ApiDefinitionsService.name);

  constructor(
    private config: ConfigService<ConfigSchema>,
    private definitionHooks: DefinitionHooksService,
  ) {}

  async discoverApiDefinitions(
    rootPath: string,
    apiFolder: string,
  ): Promise<DefinitionDiscoveryResult> {
    const apiFolderPath = join(rootPath, apiFolder);
    let hasRedoclyConfig = false;

    if (!existsSync(apiFolderPath)) {
      return { isApiFolderMissing: true, hasRedoclyConfig, definitions: [] };
    }

    const files = await this.getFilesList(apiFolderPath);
    const definitions = new Map<string, DiscoveredDefinition>();

    for (const filePath of files) {
      if (this.isRedoclyConfig(filePath)) {
        hasRedoclyConfig = true;
        const configDefinitions = await this.getDefinitionsFromConfigByPath(
          filePath,
          rootPath,
        );
        for (const definition of configDefinitions) {
          if (!definitions.has(definition.path)) {
            definitions.set(definition.path, definition);
          }
        }
      } else if (this.isOpenApiFileExt(filePath)) {
        const definition = await this.parseDefinitionByPath(filePath, rootPath);
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

  private async getFilesList(folderPath: string): Promise<string[]> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(join(folderPath, entry.name));
      } else if (entry.isDirectory()) {
        files.push(...(await this.getFilesList(join(folderPath, entry.name))));
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

  private async dumpToFs(path: string, content: any) {
    if (extname(path) === '.json') {
      await fs.writeFile(path, JSON.stringify(content, null, 2));
    } else {
      await fs.writeFile(path, dump(content));
    }
  }

  private async getDefinitionsFromConfigByPath(
    configPath: string,
    rootPath: string,
  ): Promise<DiscoveredDefinition[]> {
    const config = await this.parseFileByPath<RedoclyConfig>(configPath);

    if (!config) {
      return [];
    }

    const apis = Object.keys(config.apis || {});
    const definitions: DiscoveredDefinition[] = [];
    const { metadata: rootMetadata, resolvedPath } =
      await this.resolveMetadataRef(config.metadata, configPath);

    const enrichedRootMetadata = this.definitionHooks.enrichMetadata(
      { rootPath, filePath: configPath },
      rootMetadata,
    );

    if (enrichedRootMetadata) {
      if (resolvedPath === configPath) {
        config.metadata = enrichedRootMetadata;
      } else {
        await this.dumpToFs(resolvedPath, enrichedRootMetadata);
      }

      const configFolder = this.isVersionedFolder(configPath)
        ? configPath.split('@')[0] || ''
        : dirname(configPath);

      definitions.push({
        path: configPath,
        title: enrichedRootMetadata.title || basename(configFolder),
        metadata: enrichedRootMetadata,
      });
    }

    for (const api of apis) {
      const configApi = config?.apis?.[api];
      // try to get metadata from api level, otherwise check root metadata
      const { metadata: apiMetadata, resolvedPath } =
        await this.resolveMetadataRef(configApi?.metadata, configPath);

      const enrichedApiMetadata = this.definitionHooks.enrichMetadata(
        { rootPath, filePath: configPath },
        apiMetadata,
      );

      if (enrichedApiMetadata && configApi?.metadata) {
        if (resolvedPath === configPath) {
          configApi.metadata = enrichedApiMetadata;
        } else {
          await this.dumpToFs(resolvedPath, enrichedApiMetadata);
        }
      }

      const enrichedMetadata = enrichedApiMetadata || enrichedRootMetadata;

      if (enrichedMetadata && configApi?.root) {
        definitions.push({
          path: join(dirname(configPath), configApi.root),
          title: api,
          metadata: enrichedMetadata,
        });
      }
    }

    await this.dumpToFs(configPath, config);

    return definitions;
  }

  private async parseDefinitionByPath(
    definitionFilePath: string,
    rootPath: string,
  ): Promise<DiscoveredDefinition | undefined> {
    const definition = await this.parseFileByPath<OpenApiDefinition>(
      definitionFilePath,
    );
    const isOpenApi = Boolean(definition?.openapi || definition?.swagger);
    const info = definition?.info;

    if (isOpenApi && info?.title && info?.['x-metadata']) {
      const { metadata, resolvedPath } = await this.resolveMetadataRef(
        info['x-metadata'],
        definitionFilePath,
      );

      const enrichedMetadata = this.definitionHooks.enrichMetadata(
        { rootPath, filePath: definitionFilePath },
        metadata,
      );

      if (enrichedMetadata) {
        if (resolvedPath === definitionFilePath) {
          info['x-metadata'] = enrichedMetadata;
          await this.dumpToFs(definitionFilePath, definition);
        } else {
          await this.dumpToFs(resolvedPath, enrichedMetadata);
        }

        return {
          path: definitionFilePath,
          title: info.title,
          metadata: enrichedMetadata,
        };
      }
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

  private async parseFileByPath<T>(filePath: string): Promise<T | undefined> {
    try {
      const file = await fs.readFile(filePath, { encoding: 'utf-8' });
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

  private async resolveMetadataRef(
    metadata: ApiDefinitionMetadata | undefined,
    definitionPath: string,
  ): Promise<{
    metadata: ApiDefinitionMetadata | undefined;
    resolvedPath: string;
  }> {
    if (metadata?.$ref) {
      const refPath = join(dirname(definitionPath), metadata?.$ref);
      const refMetadata = await this.parseFileByPath<ApiDefinitionMetadata>(
        refPath,
      );
      // Handle nested refs
      return this.resolveMetadataRef(refMetadata, refPath);
    }

    return { metadata, resolvedPath: definitionPath };
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
