import {
  IsOptional,
  IsString,
  IsBoolean,
  // IsEnum,
  IsNumber,
} from 'class-validator';

export class UpdatePersonDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  // @IsEnum(['male', 'female'])
  // @IsOptional()
  // gender?: 'male' | 'female';

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
}
