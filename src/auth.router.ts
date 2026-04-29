import { Router } from "express";
import { authenticate } from "./middleware/authenticate";
import {
  initiateOAuth,
  handleCallback,
  refreshToken,
  logout,
  whoami,
} from "./auth.controller";

const router = Router();

router.get("/github", initiateOAuth);
router.get("/github/callback", handleCallback);
router.post("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/me", authenticate, whoami);

export default router;
