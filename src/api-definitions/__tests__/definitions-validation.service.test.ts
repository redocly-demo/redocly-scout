import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DefinitionsValidationService } from '../definitions-validation.service';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { GitService } from '../../git/git.service';
import { ScoutJob } from '../../jobs/types';
import {
  DefinitionDiscoveryResult,
  DefinitionValidationResult,
} from '../types';

describe('DefinitionsValidationService', () => {
  let definitionsValidationService: DefinitionsValidationService;
  let httpService: HttpService;
  let configService: ConfigService;
  let gitService: GitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), HttpModule],
      providers: [
        DefinitionsValidationService,
        {
          provide: GitService,
          useValue: {
            upsertCommitStatuses: jest.fn(),
            upsertSummaryComment: jest.fn(),
          },
        },
      ],
    }).compile();

    definitionsValidationService = module.get<DefinitionsValidationService>(
      DefinitionsValidationService,
    );
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
    gitService = module.get<GitService>(GitService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validate', () => {
    it('should fail validation when metadata variables are empty', async () => {
      const destinationPath =
        '/apis/{metadata.someMissingVariable}/{title}/{metadata.team}';
      const response = {
        data: { isValid: true },
        status: 200,
        statusText: 'OK',
      } as AxiosResponse<any>;

      jest
        .spyOn(httpService, 'post')
        .mockImplementationOnce(() => of(response));

      jest
        .spyOn(configService, 'getOrThrow')
        .mockImplementationOnce((envVariable) =>
          envVariable === 'REDOCLY_DEST_FOLDER_PATH' ? destinationPath : '',
        );

      const validationResults = await definitionsValidationService.validate(
        'jobId',
        [
          {
            path: '',
            title: 'Petstore',
            metadata: { team: 'teamA' },
          },
        ],
      );

      expect(validationResults).toHaveLength(1);
      expect(validationResults[0]?.result.isValid).toBeFalsy();
      expect(validationResults[0]?.result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: `"someMissingVariable" metadata attribute is required`,
          }),
        ]),
      );
    });

    it('should not fail validation', async () => {
      const destinationPath = '/apis/{title}/{metadata.team}';
      const response = {
        data: { isValid: true },
        status: 200,
        statusText: 'OK',
      } as AxiosResponse<any>;

      jest
        .spyOn(httpService, 'post')
        .mockImplementationOnce(() => of(response));

      jest
        .spyOn(configService, 'getOrThrow')
        .mockImplementationOnce((envVariable) =>
          envVariable === 'REDOCLY_DEST_FOLDER_PATH' ? destinationPath : '',
        );

      const validationResults = await definitionsValidationService.validate(
        'jobId',
        [
          {
            path: '',
            title: 'Petstore',
            metadata: { team: 'teamA' },
          },
        ],
      );

      expect(validationResults).toHaveLength(1);
      expect(validationResults[0]?.result.isValid).toBeTruthy();
      expect(validationResults[0]?.result.errors).toHaveLength(0);
    });
  });

  describe('publishValidationResults', () => {
    const commitSha = 'ae10er';

    const scoutJob = {
      branch: 'test-branch',
      namespaceId: 'test-org',
      providerType: 'GITHUB_CLOUD',
      repositoryId: 'test-repo',
      commitSha,
      prId: '1',
    } as ScoutJob;

    const sourceDetails = {
      branchName: scoutJob.branch,
      namespaceId: scoutJob.namespaceId,
      providerType: scoutJob.providerType,
      repositoryId: scoutJob.repositoryId,
    };

    it('should publish redocly.yaml file not found when there are no definitions', async () => {
      await definitionsValidationService.publishValidationResults(
        [],
        {} as DefinitionDiscoveryResult,
        scoutJob,
        '',
      );
      const expectedStatus = {
        description: 'redocly.yaml file not found',
        name: 'Redocly Scout',
        status: 'FAILED',
      };

      const expectedComment = `### Redocly scout: metadata validation\n\nCommit: ae10er\n\nredocly.yaml file not found`;

      expect(gitService.upsertCommitStatuses).toHaveBeenCalledWith(
        commitSha,
        [expectedStatus],
        sourceDetails,
      );
      expect(gitService.upsertSummaryComment).toHaveBeenCalledWith(
        expectedComment,
        sourceDetails,
        commitSha,
        scoutJob.prId,
      );
    });

    it('should publish redocly.yaml metadata not found when there is redocly.yaml without metadata', async () => {
      await definitionsValidationService.publishValidationResults(
        [],
        { hasRedoclyConfig: true } as DefinitionDiscoveryResult,
        scoutJob,
        '',
      );
      const expectedStatus = {
        description: 'metadata.yaml not found',
        name: 'Redocly Scout',
        status: 'FAILED',
      };

      const expectedComment = `### Redocly scout: metadata validation\n\nCommit: ae10er\n\nmetadata.yaml not found`;

      expect(gitService.upsertCommitStatuses).toHaveBeenCalledWith(
        commitSha,
        [expectedStatus],
        sourceDetails,
      );
      expect(gitService.upsertSummaryComment).toHaveBeenCalledWith(
        expectedComment,
        sourceDetails,
        commitSha,
        scoutJob.prId,
      );
    });

    it('should publish success when there is redocly.yaml with metadata', async () => {
      await definitionsValidationService.publishValidationResults(
        [
          {
            result: { isValid: true },
            definition: {
              path: 'redocly.yaml',
              title: 'petstore',
              metadata: {},
            },
          },
        ] as DefinitionValidationResult[],
        { hasRedoclyConfig: true } as DefinitionDiscoveryResult,
        scoutJob,
        '',
      );
      const expectedStatus = {
        description: 'Metadata validation successful',
        name: 'Redocly Scout',
        status: 'SUCCEEDED',
      };

      const expectedComment = `### Redocly scout: metadata validation\n\nCommit: ae10er\n\n**redocly.yaml** ✅`;

      expect(gitService.upsertCommitStatuses).toHaveBeenCalledWith(
        commitSha,
        [expectedStatus],
        sourceDetails,
      );
      expect(gitService.upsertSummaryComment).toHaveBeenCalledWith(
        expectedComment,
        sourceDetails,
        commitSha,
        scoutJob.prId,
      );
    });
  });
});
