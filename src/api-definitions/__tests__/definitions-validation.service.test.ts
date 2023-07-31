import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DefinitionsValidationService } from '../definitions-validation.service';
import { GitModule } from '../../git/git.module';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';

describe('DefinitionsValidationService', () => {
  let definitionsValidationService: DefinitionsValidationService;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        HttpModule,
        GitModule,
      ],
      providers: [DefinitionsValidationService],
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

      const validationResults = await definitionsValidationService.validate([
        {
          path: '',
          title: 'Petstore',
          metadata: { team: 'teamA' },
        },
      ]);

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

      const validationResults = await definitionsValidationService.validate([
        {
          path: '',
          title: 'Petstore',
          metadata: { team: 'teamA' },
        },
      ]);

      expect(validationResults).toHaveLength(1);
      expect(validationResults[0]?.result.isValid).toBeTruthy();
      expect(validationResults[0]?.result.errors).toHaveLength(0);
    });
  });
});
