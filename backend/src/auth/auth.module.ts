import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { GoogleAuthController } from './google/google-auth.controller';
import { GoogleAuthService } from './google/google-auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    UsersService,
    JwtAuthGuard,
    CsrfGuard,
  ],
  exports: [JwtModule, JwtAuthGuard, CsrfGuard],
})
export class AuthModule {}
