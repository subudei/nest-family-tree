import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tree } from './tree.entity';

@Injectable()
export class TreesService {
  constructor(
    @InjectRepository(Tree)
    private treesRepository: Repository<Tree>,
  ) {}

  async findById(id: string): Promise<Tree | null> {
    return this.treesRepository.findOne({ where: { id } });
  }

  async findByGuestUsername(username: string): Promise<Tree | null> {
    return this.treesRepository.findOne({ where: { guestUsername: username } });
  }

  async findAllByOwner(ownerId: string): Promise<Tree[]> {
    return this.treesRepository.find({ where: { ownerId } });
  }

  async isGuestUsernameTaken(username: string): Promise<boolean> {
    const tree = await this.findByGuestUsername(username);
    return tree !== null;
  }

  async create(treeData: Partial<Tree>): Promise<Tree> {
    const tree = this.treesRepository.create(treeData);
    return this.treesRepository.save(tree);
  }

  async update(id: string, updateData: Partial<Tree>): Promise<Tree | null> {
    await this.treesRepository.update(id, updateData);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.treesRepository.delete(id);
  }
}
