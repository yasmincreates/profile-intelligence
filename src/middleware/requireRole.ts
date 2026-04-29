import { Request, Response, NextFunction } from "express";

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "Authentication required" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ status: "error", message: "Insufficient permissions" });
    }
    next();
  };
}
