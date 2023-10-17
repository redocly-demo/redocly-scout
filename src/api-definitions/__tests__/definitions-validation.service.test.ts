import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DefinitionsValidationService } from '../definitions-validation.service';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { GitService } from '../../git/git.service';
import {
  DefinitionDiscoveryResult,
  DefinitionValidationResult,
} from '../types';

describe('DefinitionsValidationService', () => {
  let definitionsValidationService: DefinitionsValidationService;
  let httpService: HttpService;
  let configService: ConfigService;

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

  describe('getValidationSummary', () => {
    const commitSha = 'ae10er';

    it('should publish redocly.yaml file not found when there are no definitions', async () => {
      const summary = definitionsValidationService.getValidationSummary(
        [],
        {} as DefinitionDiscoveryResult,
        commitSha,
        '',
      );

      expect(summary).toEqual({
        details:
          '### Redocly scout: metadata validation\n\nCommit: ae10er\n\nredocly.yaml file not found',
        message: 'redocly.yaml file not found',
        status: 'FAILED',
      });
    });

    it('should publish redocly.yaml metadata not found when there is redocly.yaml without metadata', async () => {
      const summary = definitionsValidationService.getValidationSummary(
        [],
        { hasRedoclyConfig: true } as DefinitionDiscoveryResult,
        commitSha,
        '',
      );

      expect(summary).toEqual({
        details:
          '### Redocly scout: metadata validation\n\nCommit: ae10er\n\nmetadata.yaml not found',
        message: 'metadata.yaml not found',
        status: 'FAILED',
      });
    });

    it('should publish success when there is redocly.yaml with metadata', async () => {
      const summary = definitionsValidationService.getValidationSummary(
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
        commitSha,
        '',
      );

      expect(summary).toEqual({
        details:
          '### Redocly scout: metadata validation\n\nCommit: ae10er\n\n**redocly.yaml** ✅',
        message: 'Metadata validation successful',
        status: 'SUCCEEDED',
      });
    });
  });
});
