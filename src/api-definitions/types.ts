export type RedoclyConfigApi = {
  root?: string;
  metadata?: ApiDefinitionMetadata;
};

export type RedoclyConfig = {
  apis?: Record<string, RedoclyConfigApi>;
};

export type ApiDefinitionMetadata = {
  owner?: string;
  team?: string;
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

export type UploadTargetType = 'file' | 'folder';

export type DefinitionUploadTarget = {
  path: string;
  type: UploadTargetType;
  title: string;
  metadata: ApiDefinitionMetadata;
  isVersioned: boolean;
};

type ValidationError = {
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
