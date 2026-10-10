import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator.js';

const DB_TIMEOUT_MS = 2000;

export interface HealthResponse {
  status: 'ok';
}

/**
 * For Docker and load balancers. `ok` means the process is up and the database answers. Failure is a bare 503 with
 * no detail, because this route is public and an error message could reveal connection settings.
 */
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS).unref(),
        ),
      ]);
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
