export type HealthcheckResponse = {
  scout: 'ok';
};

export type DiskInfo = {
  size: number;
  available: number;
  used: number;
  unit: 'B' | 'KB' | 'MB' | 'GB' | 'TB';
};

export type HealthCheckInfo = {
  hostname: string;
  pid: number;
  version: string;
  jobs: {
    active: number;
    max: number;
  };
  disk: DiskInfo;
};
