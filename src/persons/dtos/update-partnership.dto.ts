import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdatePartnershipDto {
  @IsNumber()
  person1Id: number;

  @IsNumber()
  person2Id: number;

  @IsString()
  @IsOptional()
  marriageDate?: string;

  @IsString()
  @IsOptional()
  marriagePlace?: string;

  @IsBoolean()
  @IsOptional()
  divorced?: boolean;

  @IsString()
  @IsOptional()
  divorceDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
