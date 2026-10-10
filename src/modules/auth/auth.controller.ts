import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { AdminResponseDTO } from './dto/auth.dto';
import { LoginDto } from './dto/auth.dto';
import { IsPublic } from 'src/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @IsPublic(true)
  @Post('login')
  @ApiOperation({ summary: 'Admin login' })
  @ApiResponse({ status: 201, description: 'Returns JWT token and admin data' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() loginDTO: LoginDto): Promise<AdminResponseDTO> {
    return this.authService.login(loginDTO);
  }
}
