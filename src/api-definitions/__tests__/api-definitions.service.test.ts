import path from 'path';
import { DiscoveredDefinition } from '../types';
import { ApiDefinitionsService } from '../api-definitions.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScoutJob } from '../../jobs/types';

describe('ApiDefinitionsDiscoveryService', () => {
  let service: ApiDefinitionsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [ApiDefinitionsService],
    }).compile();

    service = module.get<ApiDefinitionsService>(ApiDefinitionsService);
    configService = module.get<ConfigService>(ConfigService);
    jest
      .spyOn(configService, 'getOrThrow')
      .mockImplementation(() => 'apis/{metadata.team}/{repoId}/{title}');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('discoverApiDefinitions', () => {
    it('should discover api definitions', () => {
      const apiDocsPath = path.join(__dirname, 'fixtures');
      //    └── spec
      //        ├── @v1
      //        │   ├── petstore.yaml # with metadata inside
      //        │   └── redocly.yaml  # with metadata about v1
      //        ├── @v2
      //        │   └── petstore.json # with metadata inside
      //        └── @v3
      //            ├── petstore.yaml # without metadata inside
      //            └── redocly.yaml  # with metadata about v3
      const expected = [
        {
          path: `${apiDocsPath}/spec/@v1/petstore.yaml`,
          title: 'Petstore v1 API',
          metadata: { department: 'Business & Money', owner: 'redocly' },
        },
        {
          path: `${apiDocsPath}/spec/@v2/petstore.json`,
          title: 'Petstore v2 API',
          metadata: { team: 'redocly' },
        },
        {
          path: `${apiDocsPath}/spec/@v3/petstore.yaml`,
          title: 'petstore',
          metadata: { owner: 'redocly' },
        },
      ];

      const apiFiles = service.discoverApiDefinitions(apiDocsPath, '/spec');

      expect(apiFiles).toEqual(expect.arrayContaining(expected));
      expect(apiFiles).toHaveLength(3);
    });

    it('should discover api definitions with root metadata in redocly.yaml', () => {
      const apiDocsPath = path.join(__dirname, 'fixtures');
      //    └── petstore
      //        ├── petstore.yaml # with metadata inside
      //        └── redocly.yaml  # with metadata root metadata
      const expected = [
        {
          path: `${apiDocsPath}/petstore/petstore.yaml`,
          title: 'Petstore API',
          metadata: { department: 'Business & Money', owner: 'redocly' },
        },
        {
          path: `${apiDocsPath}/petstore/redocly.yaml`,
          title: 'petstore',
          metadata: { department: 'Business & Money', owner: 'redocly' },
        },
      ];

      const apiFiles = service.discoverApiDefinitions(apiDocsPath, '/petstore');

      expect(apiFiles).toEqual(expect.arrayContaining(expected));
      expect(apiFiles).toHaveLength(2);
    });
  });

  describe('convertToUploadTargets', () => {
    const job = {
      repositoryId: 'test-repo',
      namespaceId: 'test-org',
    } as ScoutJob;

    it('should push parent folder in case of versioned apis', () => {
      const apiFiles = [
        { path: '/specs/@v1/openapi.yaml' },
        { path: '/specs/@v2/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourcePath: '/specs' }),
        ]),
      );
      expect(filesToPush).toHaveLength(1);
    });

    it('should not push root parent folder in case of versioned apis', () => {
      const apiFiles = [
        { path: '@v1/openapi.yaml' },
        { path: '@v2/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');
      expect(filesToPush).toHaveLength(0);
    });

    it('should push single files in case when they placed in the same directory', () => {
      const apiFiles = [
        { path: '/specs/cats-openapi.yaml' },
        { path: '/specs/dogs-openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourcePath: '/specs/cats-openapi.yaml' }),
          expect.objectContaining({ sourcePath: '/specs/dogs-openapi.yaml' }),
        ]),
      );
      expect(filesToPush).toHaveLength(2);
    });

    it('should push folder in case when there is only on file in the folder', () => {
      const apiFiles = [
        { path: '/specs/cats/openapi.yaml', title: 'Cats v1' },
        { path: '/specs/dogs/openapi.yaml', title: 'Dogs v1' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: '/specs/cats',
            type: 'folder',
            targetPath: 'Cats v1/@latest',
            remoteMountPath: 'apis/test-repo',
          }),
          expect.objectContaining({
            sourcePath: '/specs/dogs',
            type: 'folder',
            targetPath: 'Dogs v1/@latest',
            remoteMountPath: 'apis/test-repo',
          }),
        ]),
      );
      expect(filesToPush).toHaveLength(2);
    });

    it('should determine push files and folders', () => {
      const apiFiles = [
        { path: '/specs/hamsters/openapi.yaml', title: 'Hamsters' },
        { path: '/specs/cats/bengal-openapi.yaml', title: 'Bengal cats' },
        { path: '/specs/cats/persian-openapi.yaml', title: 'Persian cats' },
        { path: '/@v1/openapi.yaml' },
        { path: '/@v2/openapi.yaml' },
        { path: '/specs/dogs/@v1/openapi.yaml', title: 'Dogs' },
        { path: '/specs/dogs/@v2/openapi.yaml', title: 'Dogs' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '/');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: '/specs/hamsters',
            targetPath: 'Hamsters/@latest',
            remoteMountPath: 'apis/test-repo',
            type: 'folder',
            title: 'Hamsters',
          }),
          expect.objectContaining({
            sourcePath: '/specs/cats/bengal-openapi.yaml',
            targetPath: 'Bengal cats/@latest',
            remoteMountPath: 'apis/test-repo',
            type: 'file',
            title: 'Bengal cats',
          }),
          expect.objectContaining({
            sourcePath: '/specs/cats/persian-openapi.yaml',
            targetPath: 'Persian cats/@latest',
            remoteMountPath: 'apis/test-repo',
            type: 'file',
            title: 'Persian cats',
          }),
          expect.objectContaining({
            sourcePath: '/specs/dogs',
            targetPath: 'Dogs',
            remoteMountPath: 'apis/test-repo',
            type: 'folder',
            title: 'Dogs',
          }),
        ]),
      );
      expect(filesToPush).toHaveLength(4);
    });

    it('should push parent folder in case of versioned apis with nested folders', () => {
      const apiFiles = [
        { path: '/specs/@v1/openapi.yaml', title: 'api docs' },
        { path: '/specs/@v2/openapi.yaml', title: 'api docs' },
        { path: '/specs/@v2/dogs/openapi.yaml', title: 'api docs' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: '/specs',
            targetPath: 'api docs',
            remoteMountPath: 'apis/test-repo',
            type: 'folder',
            title: 'api docs',
          }),
        ]),
      );
      expect(filesToPush).toHaveLength(1);
    });

    it('should push parent folder in case of versioned apis with root metadata in the redocly.yaml', () => {
      const apiFiles = [
        {
          path: '/specs/@v1/openapi.yaml',
          metadata: { team: 'teamA' },
          title: 'api docs',
        },
        {
          path: '/specs/@v1/redocly.yaml',
          metadata: { team: 'teamB' },
          title: 'api docs',
        },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: '/specs',
            targetPath: 'api docs',
            remoteMountPath: 'apis/teamB/test-repo',
            type: 'folder',
            title: 'api docs',
          }),
        ]),
      );
      expect(filesToPush).toHaveLength(1);
    });

    it('should push folder in case of redocly.yaml', () => {
      const apiFiles = [
        { path: '/specs/redocly.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourcePath: '/specs' }),
        ]),
      );
      expect(filesToPush).toHaveLength(1);
    });

    it('should push folder in case of redocly.yaml and neighborhood openapi definition', () => {
      const apiFiles = [
        { path: '/specs/openapi.yaml' },
        { path: '/specs/redocly.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, job, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourcePath: '/specs' }),
        ]),
      );
      expect(filesToPush).toHaveLength(1);
    });
  });
});
