import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { Person } from './person.entity';
import { Partnership } from './partnership.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Person, Partnership])],
  controllers: [PersonsController],
  providers: [PersonsService],
})
export class PersonsModule {}
