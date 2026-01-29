import {
  IsOptional,
  IsString,
  IsBoolean,
  // IsEnum,
  IsNumber,
  ValidateIf,
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

  @ValidateIf((o: { fatherId?: number | null }) => o.fatherId !== null)
  @IsNumber()
  @IsOptional()
  fatherId?: number | null;

  @ValidateIf((o: { motherId?: number | null }) => o.motherId !== null)
  @IsNumber()
  @IsOptional()
  motherId?: number | null;
}
