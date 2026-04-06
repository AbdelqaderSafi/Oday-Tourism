import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Admin } from 'generated/prisma/client';
import { AdminResponseDTO } from '../auth/dto/auth.dto';
import { removeFields } from '../utils/object.util';
import * as argon from 'argon2';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prismaService: DatabaseService) {}

  async onApplicationBootstrap() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
      return;
    }

    const existing = await this.prismaService.admin.findUnique({ where: { email } });
    if (existing) return;

    const hashedPassword = await argon.hash(password);
    await this.prismaService.admin.create({
      data: { email, password: hashedPassword, name: 'Admin User' },
    });

    this.logger.log(`Admin account created: ${email}`);
  }

  findByEmail(email: string) {
    return this.prismaService.admin.findUnique({
      where: { email },
    });
  }

  mapUserWithoutPassword(
    admin: Admin,
  ): AdminResponseDTO['adminData'] {
    const userWithoutPassword = removeFields(admin, ['password']);

    return {
      ...userWithoutPassword,
      id: userWithoutPassword.id,
    };
  }
}
