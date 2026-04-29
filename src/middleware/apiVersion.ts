import { Request, Response, NextFunction } from "express";

export function apiVersion(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-api-version"] !== "1") {
    return res.status(400).json({ status: "error", message: "API version header required" });
  }
  next();
}
