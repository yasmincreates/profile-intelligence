import { Router } from "express";
import { authenticate } from "./middleware/authenticate";
import {
  initiateOAuth,
  handleCallback,
  refreshToken,
  logout,
  whoami,
  testToken,
} from "./auth.controller";

const router = Router();

router.get("/github", initiateOAuth);
router.get("/github/callback", handleCallback);
router.post("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/me", authenticate, whoami);
router.post("/test-token", testToken);

export default router;
