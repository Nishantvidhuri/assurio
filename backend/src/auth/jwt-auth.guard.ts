import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Prefer httpOnly cookie; fall back to Bearer for backwards compat
    const cookieToken = (req.cookies as Record<string, string>)?.['as_access'];
    const header: string | undefined = req.headers.authorization;
    const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    const token = cookieToken || bearerToken;
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    try {
      req.user = this.jwt.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
