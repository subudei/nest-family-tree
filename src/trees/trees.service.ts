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

  async findByAdminUsername(username: string): Promise<Tree | null> {
    return this.treesRepository.findOne({ where: { adminUsername: username } });
  }

  async findByGuestUsername(username: string): Promise<Tree | null> {
    return this.treesRepository.findOne({ where: { guestUsername: username } });
  }

  async findByEmail(email: string): Promise<Tree[]> {
    return this.treesRepository.find({ where: { ownerEmail: email } });
  }

  async findByResetToken(token: string): Promise<Tree | null> {
    return this.treesRepository.findOne({
      where: { resetPasswordToken: token },
    });
  }

  async findByUsername(
    username: string,
  ): Promise<{ tree: Tree; role: 'admin' | 'guest' } | null> {
    // First check if it's an admin username
    const adminTree = await this.findByAdminUsername(username);
    if (adminTree) {
      return { tree: adminTree, role: 'admin' };
    }

    // Then check if it's a guest username
    const guestTree = await this.findByGuestUsername(username);
    if (guestTree) {
      return { tree: guestTree, role: 'guest' };
    }

    return null;
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const result = await this.findByUsername(username);
    return result !== null;
  }

  async create(treeData: Partial<Tree>): Promise<Tree> {
    const tree = this.treesRepository.create(treeData);
    return this.treesRepository.save(tree);
  }

  async update(id: string, updateData: Partial<Tree>): Promise<Tree | null> {
    await this.treesRepository.update(id, updateData);
    return this.findById(id);
  }
}
