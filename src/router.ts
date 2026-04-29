import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  searchProfiles,
  exportProfiles,
  deleteProfile,
} from "./profiles.controller";
import { apiVersion } from "./middleware/apiVersion";
import { authenticate } from "./middleware/authenticate";
import { requireRole } from "./middleware/requireRole";

const router = Router();

// All /api/* routes require X-API-Version: 1 and authentication
router.use(apiVersion);
router.use(authenticate);

// Routes — /search and /export must come before /:id
router.get("/profiles/search", searchProfiles);
router.get("/profiles/export", exportProfiles);
router.get("/profiles", getAllProfiles);
router.get("/profiles/:id", getProfileById);

// Admin-only write operations
router.post("/profiles", requireRole("admin"), createProfile);
router.delete("/profiles/:id", requireRole("admin"), deleteProfile);

export default router;
