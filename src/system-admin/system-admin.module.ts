import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SystemAdmin } from './entities/system-admin.entity';
import { SystemAdminService } from './system-admin.service';
import { SystemAdminController } from './system-admin.controller';
import { Tree } from '../trees/tree.entity';
import { Person } from '../persons/person.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemAdmin, Tree, Person]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [SystemAdminController],
  providers: [SystemAdminService],
  exports: [SystemAdminService],
})
export class SystemAdminModule implements OnModuleInit {
  private readonly logger = new Logger(SystemAdminModule.name);

  constructor(private readonly systemAdminService: SystemAdminService) {}

  onModuleInit(): void {
    // Seed initial system admin from environment variables
    void this.seedAdmin();
  }

  private async seedAdmin(): Promise<void> {
    try {
      await this.systemAdminService.seedFromEnv();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to seed system admin', message);
    }
  }
}
