import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tree } from './tree.entity';
import { TreesService } from './trees.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tree])],
  providers: [TreesService],
  exports: [TreesService],
})
export class TreesModule {}
