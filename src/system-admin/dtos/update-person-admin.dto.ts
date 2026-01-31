import { IsString, IsOptional, IsIn, IsNumber, Matches } from 'class-validator';

/**
 * DTO for system admin to update any person
 * More permissive than regular update - allows changing more fields
 */
export class UpdatePersonAdminDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate must be in YYYY-MM-DD format',
  })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deathDate must be in YYYY-MM-DD format',
  })
  deathDate?: string;

  @IsOptional()
  @IsString()
  trivia?: string;

  @IsOptional()
  @IsNumber()
  fatherId?: number;

  @IsOptional()
  @IsNumber()
  motherId?: number;
}
