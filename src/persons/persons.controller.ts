import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePersonDto } from './dtos/create-person.dto';
import { UpdatePersonDto } from './dtos/update-person.dto';
import { PersonsService } from './persons.service';
import { Person } from './person.entity';
import { PromoteAncestorDto } from './dtos/promote-ancestor.dto';

@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Post()
  create(@Body() createPersonDto: CreatePersonDto) {
    return this.personsService.create(createPersonDto);
  }

  @Get()
  async findAllPersons(@Query('name') name?: string): Promise<Person[]> {
    if (name) {
      return await this.personsService.findPersonByName(name);
    }
    return await this.personsService.findAllPersons();
  }

  @Get('/progenitor')
  async findProgenitor(): Promise<Person | null> {
    return await this.personsService.findProgenitor();
  }

  @Post('/promote-ancestor')
  async promoteAncestor(@Body() dto: PromoteAncestorDto): Promise<Person> {
    return await this.personsService.promoteAncestor(dto);
  }

  @Delete('/orphans')
  async deleteOrphanedPersons(): Promise<{ message: string; deleted: number }> {
    return await this.personsService.deleteOrphanedPersons();
  }

  @Get('/:id')
  findPersonById(@Param('id') id: string) {
    return this.personsService.findPersonById(id);
  }

  @Delete('/:id')
  removePerson(@Param('id') id: string): Promise<{ message: string }> {
    return this.personsService.removePerson(id);
  }

  @Patch('/:id')
  async updatePerson(
    @Param('id') id: string,
    @Body() updatePersonDto: UpdatePersonDto,
  ): Promise<Person> {
    return this.personsService.updatePerson(id, updatePersonDto);
  }

  @Patch('/:id/link-children')
  async linkParentToChildren(
    @Param('id') parentId: string,
    @Body() body: { childrenIds: number[]; parentType: 'father' | 'mother' },
  ): Promise<{ message: string; updated: number }> {
    return this.personsService.linkChildrenToParent(
      Number(parentId),
      body.childrenIds,
      body.parentType,
    );
  }
}
