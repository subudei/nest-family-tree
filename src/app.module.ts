import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonsModule } from './persons/persons.module';
import { TreesModule } from './trees/trees.module';
import { Person } from './persons/person.entity';
import { Tree } from './trees/tree.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'family-tree-db.sqlite',
      entities: [Person, Tree],
      synchronize: true,
    }),
    PersonsModule,
    TreesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
