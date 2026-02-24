import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CreatePersonDto } from './dtos/create-person.dto';
import { UpdatePersonDto } from './dtos/update-person.dto';
import { PersonsService } from './persons.service';
import { Person } from './person.entity';
import { Partnership } from './partnership.entity';
import { PromoteAncestorDto } from './dtos/promote-ancestor.dto';
import { UpdatePartnershipDto } from './dtos/update-partnership.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { TreesService } from '../trees/trees.service';

type AuthUser =
  | { type: 'owner'; userId: string; email: string }
  | { type: 'guest'; treeId: string; treeName: string };

interface AuthenticatedRequest {
  user: AuthUser;
  headers: Record<string, string>;
}

@Controller('persons')
@UseGuards(JwtAuthGuard)
export class PersonsController {
  constructor(
    private readonly personsService: PersonsService,
    private readonly treesService: TreesService,
  ) {}

  /** Resolves which tree the request is for.
   * - Guest JWT: treeId is embedded in the token.
   * - Owner JWT: treeId comes from the X-Tree-Id header; ownership is verified.
   */
  private async resolveTreeId(req: AuthenticatedRequest): Promise<string> {
    const user = req.user;
    if (user.type === 'guest') return user.treeId;

    const treeId = req.headers['x-tree-id'];
    if (!treeId) throw new ForbiddenException('No tree selected');

    const tree = await this.treesService.findById(treeId);
    if (!tree || tree.ownerId !== user.userId)
      throw new ForbiddenException('Access denied to this tree');

    return treeId;
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(
    @Body() createPersonDto: CreatePersonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.create(createPersonDto, treeId);
  }

  @Get()
  async findAllPersons(
    @Query('name') name: string | undefined,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person[]> {
    const treeId = await this.resolveTreeId(req);
    if (name) {
      return await this.personsService.findPersonByName(name, treeId);
    }
    return await this.personsService.findAllPersons(treeId);
  }

  @Get('/progenitor')
  async findProgenitor(
    @Request() req: AuthenticatedRequest,
  ): Promise<Person | null> {
    const treeId = await this.resolveTreeId(req);
    return await this.personsService.findProgenitor(treeId);
  }

  @Post('/promote-ancestor')
  @UseGuards(AdminGuard)
  async promoteAncestor(
    @Body() dto: PromoteAncestorDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person> {
    const treeId = await this.resolveTreeId(req);
    return await this.personsService.promoteAncestor(dto, treeId);
  }

  @Delete('/orphans')
  @UseGuards(AdminGuard)
  async deleteOrphanedPersons(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string; deleted: number }> {
    const treeId = await this.resolveTreeId(req);
    return await this.personsService.deleteOrphanedPersons(treeId);
  }

  @Get('/:id')
  async findPersonById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.findPersonById(id, treeId);
  }

  @Delete('/:id')
  @UseGuards(AdminGuard)
  async removePerson(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.removePerson(id, treeId);
  }

  @Patch('/:id')
  @UseGuards(AdminGuard)
  async updatePerson(
    @Param('id') id: string,
    @Body() updatePersonDto: UpdatePersonDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.updatePerson(id, updatePersonDto, treeId);
  }

  @Patch('/:id/link-children')
  @UseGuards(AdminGuard)
  async linkParentToChildren(
    @Param('id') parentId: string,
    @Body() body: { childrenIds: number[]; parentType: 'father' | 'mother' },
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string; updated: number }> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.linkChildrenToParent(
      Number(parentId),
      body.childrenIds,
      body.parentType,
      treeId,
    );
  }

  // ============ Partnership Endpoints ============

  @Get('/partnerships/all')
  async getPartnerships(
    @Request() req: AuthenticatedRequest,
  ): Promise<Partnership[]> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.getPartnerships(treeId);
  }

  @Get('/partnerships/pair')
  async getPartnership(
    @Query('person1Id') person1Id: string,
    @Query('person2Id') person2Id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Partnership | null> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.getPartnership(
      Number(person1Id),
      Number(person2Id),
      treeId,
    );
  }

  @Post('/partnerships')
  @UseGuards(AdminGuard)
  async upsertPartnership(
    @Body() dto: UpdatePartnershipDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Partnership> {
    const treeId = await this.resolveTreeId(req);
    return this.personsService.upsertPartnership(dto, treeId);
  }
}
