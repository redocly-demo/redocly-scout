export type RedoclyConfigApi = {
  root?: string;
  metadata?: ApiDefinitionMetadata;
};

export type RedoclyConfig = {
  apis?: Record<string, RedoclyConfigApi>;
  metadata?: ApiDefinitionMetadata;
};

export type ApiDefinitionMetadata = {
  owner?: string;
  team?: string;
  title?: string;
  $ref?: string;
};

export type OpenApiDefinition = {
  openapi?: string | number;
  swagger?: string | number;
  info?: {
    title?: string;
    ['x-metadata']?: ApiDefinitionMetadata;
  };
};

export type DiscoveredDefinition = {
  path: string;
  title: string;
  metadata: ApiDefinitionMetadata;
};

export type DefinitionDiscoveryResult = {
  isApiFolderMissing: boolean;
  hasRedoclyConfig: boolean;
  definitions: DiscoveredDefinition[];
};

export type UploadTargetType = 'file' | 'folder';

export type DefinitionUploadTarget = {
  sourcePath: string;
  targetPath: string;
  remoteMountPath: string;
  type: UploadTargetType;
  title: string;
  metadata: ApiDefinitionMetadata;
};

export type UploadTargetConfig = {
  type: UploadTargetType;
  path: string;
  isVersioned?: boolean;
};

export type UploadTargetDestination = {
  targetPath: string;
  remoteMountPath: string;
};

export type ValidationError = {
  message: string;
};

export type ValidationResult = {
  isValid: boolean;
  errors?: ValidationError[];
};

export type DefinitionValidationResult = {
  definition: DiscoveredDefinition;
  result: ValidationResult;
};

export type ValidationSummary = {
  message: string;
  details: string;
  status: 'SUCCEEDED' | 'FAILED';
};
