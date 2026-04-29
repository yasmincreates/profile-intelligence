import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import router from "./router";
import authRouter from "./auth.router";
import { logger } from "./middleware/logger";
import { authLimiter, apiLimiter } from "./middleware/rateLimiter";

const app = express();

app.use(logger);
app.use(express.json());
app.use(cookieParser());

// CORS — support both web portal (credentialed) and other clients (open)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const frontendUrl = process.env.FRONTEND_URL;

  if (origin && frontendUrl && origin === frontendUrl) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Version, X-CSRF-Token");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/auth", authLimiter, authRouter);
app.use("/api", apiLimiter, router);

// Export for Vercel serverless
export default app;

// Local dev only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
