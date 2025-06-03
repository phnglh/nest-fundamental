import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      this.logger.log('Database connection established successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to connect to the database', error.stack);
      } else {
        this.logger.error('Failed to connect to the database', String(error));
      }
    }
  }
}
