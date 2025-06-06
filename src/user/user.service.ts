import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findByEmail(email: string) {
    return this.userRepository.findOneBy({ email });
  }

  async create(data: Partial<User>): Promise<User> {
    const hashed = await bcrypt.hash(data.password!, 10);
    const user = this.userRepository.create({
      ...data,
      password: hashed,
    });
    return this.userRepository.save(user);
  }
  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }
  async update(id: string, data: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new Error('User not found');
    Object.assign(user, data);
    return this.userRepository.save(user);
  }
  async delete(id: string): Promise<void> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new Error('User not found');
    await this.userRepository.remove(user);
  }
}
