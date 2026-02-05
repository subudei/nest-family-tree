import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonsModule } from './persons/persons.module';
import { TreesModule } from './trees/trees.module';
import { AuthModule } from './auth/auth.module';
import { SystemAdminModule } from './system-admin/system-admin.module';
import { EmailModule } from './email/email.module';
import { Person } from './persons/person.entity';
import { Tree } from './trees/tree.entity';
import { SystemAdmin } from './system-admin/entities/system-admin.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'family-tree-db.sqlite',
      entities: [Person, Tree, SystemAdmin],
      synchronize: true,
    }),
    EmailModule,
    PersonsModule,
    TreesModule,
    AuthModule,
    SystemAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
