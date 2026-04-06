import { Admin } from 'generated/prisma/browser';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SuperSecretPassword123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export type AdminResponseDTO = {
  token: string;
  adminData: Omit<Admin, 'password'>;
};
