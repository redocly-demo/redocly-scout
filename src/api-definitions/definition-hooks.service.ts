import fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { load } from 'js-yaml';

type DefinitionHooks = {
  enrichMetadata: (
    context: {
      rootPath: string;
      filePath: string;
      loadYaml: (str: string) => unknown;
    },
    metadata: any,
  ) => any;
};

@Injectable()
export class DefinitionHooksService {
  private readonly logger = new Logger(DefinitionHooksService.name);
  private hooks: DefinitionHooks;
  private stubHooks: DefinitionHooks = {
    enrichMetadata: (_, metadata) => metadata,
  };

  constructor() {
    const hooksFilePath = '/data/hooks.js';

    try {
      if (fs.existsSync(hooksFilePath)) {
        this.hooks = require(hooksFilePath);
      } else {
        this.hooks = this.stubHooks;
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to parse definition hooks file');

      this.hooks = this.stubHooks;
    }
  }

  enrichMetadata(
    context: {
      rootPath: string;
      filePath: string;
    },
    metadata: any,
  ) {
    return this.hooks.enrichMetadata({ ...context, loadYaml: load }, metadata);
  }
}
