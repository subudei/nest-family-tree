import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Request as ExpressRequest } from 'express';
import { TreesService } from './trees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateTreeDto } from './dtos/create-tree.dto';
import { UpdateTreeDto } from './dtos/update-tree.dto';
import { UpdateGuestPasswordDto } from './dtos/update-guest-password.dto';

type OwnerRequest = ExpressRequest & {
  user: { type: 'owner'; userId: string; email: string };
};

type AuthRequest = ExpressRequest & {
  user:
    | { type: 'owner'; userId: string; email: string }
    | { type: 'guest'; treeId: string; treeName: string };
};

const SALT_ROUNDS = 10;

@Controller('trees')
@UseGuards(JwtAuthGuard)
export class TreesController {
  constructor(private treesService: TreesService) {}

  // ── Owner: list all their trees ─────────────────────────────────────────────

  @Get()
  @UseGuards(AdminGuard)
  async getMyTrees(@Request() req: OwnerRequest) {
    const trees = await this.treesService.findAllByOwner(req.user.userId);
    return trees.map((t) => ({
      id: t.id,
      name: t.name,
      guestUsername: t.guestUsername,
      createdAt: t.createdAt,
    }));
  }

  // ── Owner: create a new tree ─────────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  async createTree(@Body() dto: CreateTreeDto, @Request() req: OwnerRequest) {
    if (await this.treesService.isGuestUsernameTaken(dto.guestUsername)) {
      throw new ConflictException('Guest username is already taken');
    }

    const guestPasswordHash = await bcrypt.hash(dto.guestPassword, SALT_ROUNDS);

    const tree = await this.treesService.create({
      name: dto.treeName,
      ownerId: req.user.userId,
      guestUsername: dto.guestUsername,
      guestPasswordHash,
    });

    return {
      id: tree.id,
      name: tree.name,
      guestUsername: tree.guestUsername,
      createdAt: tree.createdAt,
    };
  }

  // ── Get single tree (owner sees full info, guest sees their own tree) ────────

  @Get(':id')
  async getTree(@Param('id') id: string, @Request() req: AuthRequest) {
    const tree = await this.treesService.findById(id);
    if (!tree) throw new NotFoundException('Tree not found');

    const user = req.user;

    if (user.type === 'owner') {
      // Owner must own this tree
      if (tree.ownerId !== user.userId) {
        throw new ForbiddenException('Access denied');
      }
      return {
        id: tree.id,
        name: tree.name,
        guestUsername: tree.guestUsername,
        createdAt: tree.createdAt,
      };
    }

    // Guest: can only access their own tree
    if (user.treeId !== id) {
      throw new ForbiddenException('Access denied');
    }

    return {
      id: tree.id,
      name: tree.name,
    };
  }

  // ── Owner: rename a tree ─────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(AdminGuard)
  async updateTree(
    @Param('id') id: string,
    @Body() dto: UpdateTreeDto,
    @Request() req: OwnerRequest,
  ) {
    const tree = await this.treesService.findById(id);
    if (!tree) throw new NotFoundException('Tree not found');
    if (tree.ownerId !== req.user.userId)
      throw new ForbiddenException('Access denied');

    const updated = await this.treesService.update(id, { name: dto.name });
    return {
      id: updated!.id,
      name: updated!.name,
      guestUsername: updated!.guestUsername,
      createdAt: updated!.createdAt,
    };
  }

  // ── Owner: change guest password for a tree ──────────────────────────────────

  @Patch(':id/guest-password')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateGuestPassword(
    @Param('id') id: string,
    @Body() dto: UpdateGuestPasswordDto,
    @Request() req: OwnerRequest,
  ) {
    const tree = await this.treesService.findById(id);
    if (!tree) throw new NotFoundException('Tree not found');
    if (tree.ownerId !== req.user.userId)
      throw new ForbiddenException('Access denied');

    const guestPasswordHash = await bcrypt.hash(
      dto.newGuestPassword,
      SALT_ROUNDS,
    );
    await this.treesService.update(id, { guestPasswordHash });

    return { success: true, message: 'Guest password updated successfully' };
  }

  // ── Owner: delete a tree (and all persons in it via CASCADE) ─────────────────

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async deleteTree(@Param('id') id: string, @Request() req: OwnerRequest) {
    const tree = await this.treesService.findById(id);
    if (!tree) throw new NotFoundException('Tree not found');
    if (tree.ownerId !== req.user.userId)
      throw new ForbiddenException('Access denied');

    await this.treesService.delete(id);
    return { success: true, message: 'Tree deleted successfully' };
  }
}
