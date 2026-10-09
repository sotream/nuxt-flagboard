import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum.js';
import { isUniqueViolation } from '../../common/utils/db-errors.js';
import { hashPassword } from '../../common/utils/password.js';
import { User } from './entities/user.entity.js';

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Creates a viewer. Admins come from the seed, never from a request. */
  async createViewer(email: string, password: string): Promise<PublicUser> {
    try {
      const user = await this.users.save({
        email: email.trim().toLowerCase(),
        passwordHash: await hashPassword(password),
        role: Role.Viewer,
      });
      return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }
}
