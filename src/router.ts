import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  deleteProfile,
} from "./profiles.controller";

const router = Router();

router.post("/profiles", createProfile);
router.get("/profiles", getAllProfiles);
router.get("/profiles/:id", getProfileById);
router.delete("/profiles/:id", deleteProfile);

export default router;
