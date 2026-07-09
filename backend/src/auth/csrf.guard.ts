import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookie = (req.cookies as Record<string, string>)?.['as_csrf'];
    const header = req.headers['x-csrf-token'] as string | undefined;

    if (!cookie || !header || cookie !== header) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }
    return true;
  }
}
