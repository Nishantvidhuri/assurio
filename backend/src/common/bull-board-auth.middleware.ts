import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';

/** Protects the Bull Board UI — only users with role=admin may access it. */
@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.as_access;

    if (!token) {
      res.status(401).json({ message: 'Admin login required to view queue dashboard' });
      return;
    }

    try {
      const payload = this.jwt.verify<{ role?: string; sub: string }>(token);
      if (payload.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden — admin access only' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired session' });
    }
  }
}
