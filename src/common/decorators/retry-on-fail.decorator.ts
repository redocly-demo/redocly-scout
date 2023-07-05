import { Logger } from '@nestjs/common';

const MAX_RETRIES = 1;

interface Retryable {
  logger: Logger;
}

export function RetryOnFail<T extends Retryable, R>(
  _target: T,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (this: T, ...args: any[]): Promise<R> {
    let retries = 0;
    while (retries <= MAX_RETRIES) {
      try {
        return await originalMethod?.apply(this, args);
      } catch (err) {
        const isClientError =
          Number.isInteger(err?.status) &&
          err?.status >= 400 &&
          err?.status < 500;
        const isRetryable = !isClientError;

        this.logger.warn(
          { operation: propertyKey, isRetryable, retries, err },
          `Operation failed`,
        );

        retries++;
        if (!isRetryable || retries > MAX_RETRIES) {
          throw err;
        }
      }
    }

    // Unreachable code, needed for satisfying TS requirements
    throw new Error('Unexpected retry');
  };

  return descriptor;
}
