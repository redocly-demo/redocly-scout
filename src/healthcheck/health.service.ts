import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DiskInfo, HealthCheckInfo } from './types';
import * as os from 'os';
import * as process from 'process';
import { execFileSync } from 'child_process';

const SIZE_COLUMN_INDEX = 1;
const AVAILABLE_COLUMN_INDEX = 3;

@Injectable()
export class HealthService {
  readonly logger = new Logger(HealthService.name);
  private readonly orgId: string;
  private readonly portalId: string;
  private readonly version: string;
  private readonly maxConcurrentJobs: number;

  constructor(
    private config: ConfigService<ConfigSchema>,
    private readonly httpService: HttpService,
  ) {
    this.orgId = this.config.getOrThrow('REDOCLY_ORG_ID');
    this.portalId = this.config.getOrThrow('REDOCLY_PORTAL_ID');
    this.version = this.config.getOrThrow('SCOUT_VERSION');
    this.maxConcurrentJobs = this.config.getOrThrow('MAX_CONCURRENT_JOBS');
  }

  async report(activeJobs: number): Promise<void> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/status`;
    const info: HealthCheckInfo = {
      hostname: os.hostname(),
      pid: process.pid,
      version: this.version,
      jobs: {
        active: activeJobs,
        max: this.maxConcurrentJobs,
      },
      disk: this.getDiskInfo(),
    };

    await firstValueFrom(this.httpService.post(url, info));
  }

  private getDiskInfo(): DiskInfo {
    const stdout = execFileSync('df', ['-Pm', '--', '/'], {
      encoding: 'utf-8',
    });
    const diskData = stdout
      .split('\n') // Split lines
      .map((line) => line.trim()) // Trim all lines
      .filter((line) => line.length !== 0) // Remove empty lines
      .slice(1) // Remove header
      .map((line) => line.split(/\s+(?=[\d/])/)) // Split on spaces to get columns
      .pop(); // Get disk data

    if (!diskData) {
      throw new Error('Unable to get disk data');
    }
    const size = parseInt(diskData[SIZE_COLUMN_INDEX] || '0');
    const available = parseInt(diskData[AVAILABLE_COLUMN_INDEX] || '0');

    return {
      size,
      available,
      used: size - available,
      unit: 'MB',
    };
  }
}
