import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: string;
  role: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.access_token;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cookieToken;

  if (!token) {
    return res.status(401).json({ status: "error", message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser & { is_active: boolean };

    if (payload.is_active === false) {
      return res.status(403).json({ status: "error", message: "Account is disabled" });
    }

    req.user = { id: payload.id, role: payload.role, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ status: "error", message: "Invalid or expired token" });
  }
}
