import { Test, TestingModule } from '@nestjs/testing';
import { RemotesService } from '../remotes.service';
import { DefinitionUploadTarget } from '../../api-definitions/types';
import { ScoutJob } from '../../jobs/types';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

describe('RemotesService', () => {
  const job: ScoutJob = {
    id: 'sjob_1',
    type: 'PROCESS_GIT_REPO',
    status: 'PROCESSING',
    providerType: 'GITHUB_CLOUD',
    organizationId: 'o_1',
    portalId: 'p_1',
    namespaceId: 'test-namespace',
    repositoryId: 'test-repository',
    branch: 'test-branch',
    attempts: 0,
    commitSha: 'fffff',
    createdAt: new Date(),
    updatedAt: new Date(),
    isMainBranch: false,
  };

  let service: RemotesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), HttpModule],
      providers: [RemotesService],
    }).compile();

    service = module.get<RemotesService>(RemotesService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getMountPath', () => {
    it('should build mount path with @latest version', () => {
      const uploadTarget: DefinitionUploadTarget = {
        type: 'file',
        path: './petstore.yaml',
        isVersioned: false,
        metadata: { team: 'teamA' },
        title: 'Petstore',
      };

      const mountPath = service.getMountPath(
        '/apis/{metadata.team}/{repoId}/{title}/',
        uploadTarget,
        job,
      );

      expect(mountPath).toBe('apis/teamA/test-repository/Petstore/@latest');
    });

    it('should build mount path for versioned folders', () => {
      const uploadTarget: DefinitionUploadTarget = {
        type: 'file',
        path: './petstore.yaml',
        isVersioned: true,
        metadata: { team: 'teamA' },
        title: 'Petstore',
      };

      const mountPath = service.getMountPath(
        '/apis/{metadata.team}/{repoId}/{title}/',
        uploadTarget,
        job,
      );

      expect(mountPath).toBe('apis/teamA/test-repository/Petstore');
    });
  });
});
