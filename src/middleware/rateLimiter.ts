import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { status: "error", message: "Too many requests, please try again later" },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => req.user?.id ?? req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { status: "error", message: "Too many requests, please try again later" },
});
