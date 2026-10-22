import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Menu } from './entities/menu.entity';

import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { RoleService } from './services/role.service';
import { MenuService } from './services/menu.service';

import { AuthController } from './controllers/auth.controller';
import { UserController } from './controllers/user.controller';
import { RoleController } from './controllers/role.controller';
import { MenuController } from './controllers/menu.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('jwt.secret') || 'hr_jwt_secret_dev_2026_key',
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn') || '7200s',
        },
      }),
    }),
    TypeOrmModule.forFeature([User, Role, Menu]),
  ],
  controllers: [
    AuthController,
    UserController,
    RoleController,
    MenuController,
  ],
  providers: [
    AuthService,
    UserService,
    RoleService,
    MenuService,
    JwtStrategy,
  ],
  exports: [AuthService, UserService, RoleService, MenuService],
})
export class RbacModule {}
