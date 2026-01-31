import {
  Body,
  Controller,
  Delete,
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
import { PromoteAncestorDto } from './dtos/promote-ancestor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

interface AuthenticatedRequest {
  user: {
    treeId: string;
    role: 'admin' | 'guest';
    treeName: string;
  };
}

@Controller('persons')
@UseGuards(JwtAuthGuard)
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body() createPersonDto: CreatePersonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.personsService.create(createPersonDto, req.user.treeId);
  }

  @Get()
  async findAllPersons(
    @Query('name') name: string | undefined,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person[]> {
    if (name) {
      return await this.personsService.findPersonByName(name, req.user.treeId);
    }
    return await this.personsService.findAllPersons(req.user.treeId);
  }

  @Get('/progenitor')
  async findProgenitor(
    @Request() req: AuthenticatedRequest,
  ): Promise<Person | null> {
    return await this.personsService.findProgenitor(req.user.treeId);
  }

  @Post('/promote-ancestor')
  @UseGuards(AdminGuard)
  async promoteAncestor(
    @Body() dto: PromoteAncestorDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person> {
    return await this.personsService.promoteAncestor(dto, req.user.treeId);
  }

  @Delete('/orphans')
  @UseGuards(AdminGuard)
  async deleteOrphanedPersons(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string; deleted: number }> {
    return await this.personsService.deleteOrphanedPersons(req.user.treeId);
  }

  @Get('/:id')
  findPersonById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.personsService.findPersonById(id, req.user.treeId);
  }

  @Delete('/:id')
  @UseGuards(AdminGuard)
  removePerson(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.personsService.removePerson(id, req.user.treeId);
  }

  @Patch('/:id')
  @UseGuards(AdminGuard)
  async updatePerson(
    @Param('id') id: string,
    @Body() updatePersonDto: UpdatePersonDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Person> {
    return this.personsService.updatePerson(
      id,
      updatePersonDto,
      req.user.treeId,
    );
  }

  @Patch('/:id/link-children')
  @UseGuards(AdminGuard)
  async linkParentToChildren(
    @Param('id') parentId: string,
    @Body() body: { childrenIds: number[]; parentType: 'father' | 'mother' },
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string; updated: number }> {
    return this.personsService.linkChildrenToParent(
      Number(parentId),
      body.childrenIds,
      body.parentType,
      req.user.treeId,
    );
  }
}
