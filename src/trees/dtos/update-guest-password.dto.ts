import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGuestPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(100)
  newGuestPassword: string;
}
