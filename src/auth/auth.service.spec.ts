import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userService: Partial<Record<keyof UserService, jest.Mock>>;
  let jwtService: Partial<Record<keyof JwtService, jest.Mock>>;
  let tokenRepo: Partial<Record<keyof Repository<RefreshToken>, jest.Mock>>;

  beforeEach(async () => {
    userService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    jwtService = {
      sign: jest.fn(),
    };
    tokenRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: 'RefreshTokenRepository', useValue: tokenRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('should return user data without password if password matches', async () => {
      const user = {
        id: 'fssdfss',
        email: 'test@example.com',
        password: 'hashed',
        role: 'user',
      } as User;
      userService.findByEmail!.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare');

      const result = await service.validateUser(
        'test@example.com',
        'plainPass',
      );

      expect(userService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          email: 'test@example.com',
          role: 'user',
        }),
      );
    });

    it('should return null if user not found', async () => {
      userService.findByEmail!.mockResolvedValue(null);

      const result = await service.validateUser(
        'test@example.com',
        'plainPass',
      );

      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const user = {
        id: 'fsdfssffs',
        email: 'test@example.com',
        password: 'hashed',
        role: 'user',
      } as User;
      userService.findByEmail!.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare');

      const result = await service.validateUser(
        'test@example.com',
        'wrongPass',
      );

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token, refresh token and user info', async () => {
      const user = {
        id: 'fsdfssffs',
        email: 'test@example.com',
        role: 'user',
      } as User;
      jwtService.sign!.mockReturnValue('access-token');
      jest
        .spyOn(service, 'createRefreshToken')
        .mockResolvedValue('refresh-token');

      const result = await service.login(user, 'ip-address', 'user-agent');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: user.id, email: user.email, role: user.role },
      });
    });
  });

  describe('register', () => {
    it('should throw UnauthorizedException if email already registered', async () => {
      userService.findByEmail!.mockResolvedValue({} as User);

      await expect(
        service.register('test@example.com', 'pass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should create new user and return user info without password', async () => {
      const newUser = {
        id: 'dasfasf',
        email: 'test@example.com',
        role: 'user',
      } as User;
      userService.findByEmail!.mockResolvedValue(null);
      userService.create!.mockResolvedValue(newUser);

      const result = await service.register('test@example.com', 'pass');

      expect(userService.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'pass',
      });
      expect(result).toEqual(newUser);
    });
  });

  describe('createRefreshToken', () => {
    it('should create and save a refresh token', async () => {
      const user = { id: 'dfsfsfs', email: 'test@example.com' } as User;
      jwtService.sign!.mockReturnValue('refresh-token');
      const saveMock = jest.fn();
      tokenRepo.create!.mockReturnValue({ token: 'refresh-token' } as any);
      tokenRepo.save = saveMock;

      const result = await service.createRefreshToken(user, 'ip', 'agent');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: user.id, email: user.email, type: 'refresh' },
        { expiresIn: '7d' },
      );
      expect(tokenRepo.create).toHaveBeenCalled();
      expect(saveMock).toHaveBeenCalled();
      expect(result).toBe('refresh-token');
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException if token not found', async () => {
      tokenRepo.findOne!.mockResolvedValue(null);

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token revoked or expired', async () => {
      const expiredToken = {
        token: 'token',
        revoked: true,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'dsfsfs', email: 'test@example.com', role: 'user' } as User,
      };
      tokenRepo.findOne!.mockResolvedValue(expiredToken);

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return new access token if refresh token valid', async () => {
      const validToken = {
        token: 'token',
        revoked: false,
        expiresAt: new Date(Date.now() + 1000000),
        user: {
          id: 'fsdfsfssf',
          email: 'test@example.com',
          role: 'user',
        } as User,
      };
      tokenRepo.findOne!.mockResolvedValue(validToken);
      jwtService.sign!.mockReturnValue('new-access-token');

      const result = await service.refresh('some-token');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: validToken.user.id,
        email: validToken.user.email,
        role: validToken.user.role,
      });
      expect(result).toEqual({ accessToken: 'new-access-token' });
    });
  });
});
