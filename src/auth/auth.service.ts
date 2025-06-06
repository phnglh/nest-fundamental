import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private tokenRepo: Repository<RefreshToken>,
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.userService.findByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: User, ipAddress: string, userAgent: string) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(
      user,
      ipAddress,
      userAgent,
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async register(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'>> {
    const existing = await this.userService.findByEmail(email);
    if (existing) throw new UnauthorizedException('Email already registered');

    const newUser = await this.userService.create({ email, password });
    const { ...rest } = newUser;
    return rest;
  }

  async createRefreshToken(
    user: User,
    ip: string,
    agent: string,
  ): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const entity = this.tokenRepo.create({
      token,
      user,
      ipAddress: ip,
      userAgent: agent,
      expiresAt,
      revoked: false,
    });

    await this.tokenRepo.save(entity);

    return token;
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    const found = await this.tokenRepo.findOne({
      where: { token },
      relations: ['user'],
    });
    if (!found || found.revoked || found.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const payload = {
      sub: found.user.id,
      email: found.user.email,
      role: found.user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }
}
