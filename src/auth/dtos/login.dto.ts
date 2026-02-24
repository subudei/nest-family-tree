import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Owner logs in with email + account password
export class OwnerLoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

// Guest logs in with their guest username + password
export class GuestLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
