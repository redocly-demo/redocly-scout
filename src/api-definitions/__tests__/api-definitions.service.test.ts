import path from 'path';
import { DiscoveredDefinition } from '../types';
import { ApiDefinitionsService } from '../api-definitions.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApiDefinitionsDiscoveryService', () => {
  let service: ApiDefinitionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiDefinitionsService],
    }).compile();

    service = module.get<ApiDefinitionsService>(ApiDefinitionsService);
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
  });

  describe('convertToUploadTargets', () => {
    it('should push parent folder in case of versioned apis', () => {
      const apiFiles = [
        { path: '/specs/@v1/openapi.yaml' },
        { path: '/specs/@v2/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: '/specs' })]),
      );
      expect(filesToPush).toHaveLength(1);
    });

    it('should not push root parent folder in case of versioned apis', () => {
      const apiFiles = [
        { path: '@v1/openapi.yaml' },
        { path: '@v2/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '');
      expect(filesToPush).toHaveLength(0);
    });

    it('should push single files in case when they placed in the same directory', () => {
      const apiFiles = [
        { path: '/specs/cats-openapi.yaml' },
        { path: '/specs/dogs-openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/specs/cats-openapi.yaml' }),
          expect.objectContaining({ path: '/specs/dogs-openapi.yaml' }),
        ]),
      );
      expect(filesToPush).toHaveLength(2);
    });

    it('should push folder in case when there is only on file in the folder', () => {
      const apiFiles = [
        { path: '/specs/cats/openapi.yaml' },
        { path: '/specs/dogs/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/specs/cats' }),
          expect.objectContaining({ path: '/specs/dogs' }),
        ]),
      );
      expect(filesToPush).toHaveLength(2);
    });

    it('should determine push files and folders', () => {
      const apiFiles = [
        { path: '/specs/hamsters/openapi.yaml' },
        { path: '/specs/cats/bengal-openapi.yaml' },
        { path: '/specs/cats/persian-openapi.yaml' },
        { path: '/@v1/openapi.yaml' },
        { path: '/@v2/openapi.yaml' },
        { path: '/specs/dogs/@v1/openapi.yaml' },
        { path: '/specs/dogs/@v2/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '/');

      expect(filesToPush).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/specs/hamsters' }),
          expect.objectContaining({ path: '/specs/cats/bengal-openapi.yaml' }),
          expect.objectContaining({ path: '/specs/cats/persian-openapi.yaml' }),
          expect.objectContaining({ path: '/specs/dogs' }),
        ]),
      );
      expect(filesToPush).toHaveLength(4);
    });

    it('should push parent folder in case of versioned apis with nested folders', () => {
      const apiFiles = [
        { path: '/specs/@v1/openapi.yaml' },
        { path: '/specs/@v2/openapi.yaml' },
        { path: '/specs/@v2/dogs/openapi.yaml' },
      ] as DiscoveredDefinition[];

      const filesToPush = service.convertToUploadTargets(apiFiles, '');

      expect(filesToPush).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: '/specs' })]),
      );
      expect(filesToPush).toHaveLength(1);
    });
  });
});
