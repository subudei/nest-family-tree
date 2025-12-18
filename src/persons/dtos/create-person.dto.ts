import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsArray,
} from 'class-validator';

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEnum(['male', 'female'], {
    message: 'gender must be either male or female',
  })
  gender: 'male' | 'female';

  @IsBoolean()
  @IsOptional()
  progenitor?: boolean;

  @IsString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  deathDate?: string;

  @IsString()
  @IsOptional()
  trivia?: string;

  @IsNumber()
  @IsOptional()
  fatherId?: number;

  @IsNumber()
  @IsOptional()
  motherId?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  childrenIds?: number[];
}
