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
      throw new Error(
        'ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set. ' +
          'Refusing to start without them to prevent insecure defaults.',
      );
    }

    const existing = await this.prismaService.admin.findUnique({ where: { email } });

    if (!existing) {
      const hashedPassword = await argon.hash(password);
      await this.prismaService.admin.create({
        data: { email, password: hashedPassword, name: 'Admin User' },
      });
      this.logger.log(`Admin account created: ${email}`);
      return;
    }

    // Always verify the stored hash against the current env password so that
    // rotating ADMIN_PASSWORD in the environment takes effect on next restart
    // instead of silently continuing to accept the old credential.
    const passwordInSync = await argon.verify(existing.password, password);
    if (!passwordInSync) {
      const hashedPassword = await argon.hash(password);
      await this.prismaService.admin.update({
        where: { email },
        data: { password: hashedPassword },
      });
      this.logger.log('Admin password synced to match current environment configuration.');
    }
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
