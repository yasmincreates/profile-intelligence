import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  searchProfiles,
  deleteProfile,
} from "./profiles.controller";

const router = Router();

router.post("/profiles", createProfile);
router.get("/profiles/search", searchProfiles);
router.get("/profiles", getAllProfiles);
router.get("/profiles/:id", getProfileById);
router.delete("/profiles/:id", deleteProfile);

export default router;
