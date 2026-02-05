import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  treeId?: string; // Optional: if user has multiple trees, they select one
}

export class ForgotPasswordResponseDto {
  message: string;
  requiresTreeSelection?: boolean;
  trees?: { id: string; name: string; adminUsername: string }[];
}
