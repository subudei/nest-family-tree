import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tree } from './tree.entity';
import { TreesService } from './trees.service';
import { TreesController } from './trees.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tree])],
  controllers: [TreesController],
  providers: [TreesService],
  exports: [TreesService],
})
export class TreesModule {}
