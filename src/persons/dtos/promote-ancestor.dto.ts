import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PromoteAncestorDto {
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
  @IsNotEmpty()
  currentProgenitorId: number;

  @IsEnum(['father', 'mother'])
  relationship: 'father' | 'mother';
}
