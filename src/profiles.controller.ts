import { Request, Response } from "express";
import {
  enrichAndStore,
  findById,
  findAll,
  removeById,
} from "./profiles.service";

export async function createProfile(req: Request, res: Response) {
  const { name } = req.body;

  if (!name || name === "") {
    return res
      .status(400)
      .json({ status: "error", message: "Missing or empty name" });
  }
  if (typeof name !== "string") {
    return res
      .status(422)
      .json({ status: "error", message: "name must be a string" });
  }

  try {
    const result = await enrichAndStore(name);

    if (result.alreadyExists) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: result.data,
      });
    }

    return res.status(201).json({
      status: "success",
      data: result.data,
    });
  } catch (err: any) {
    if (err.code === 502) {
      return res.status(502).json({
        status: "502",
        message: `${err.api} returned an invalid response`,
      });
    }
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
}

export async function getProfileById(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const profile = await findById(id);
    if (!profile) {
      return res
        .status(404)
        .json({ status: "error", message: "Profile not found" });
    }
    return res.status(200).json({ status: "success", data: profile });
  } catch {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
}

export async function getAllProfiles(req: Request, res: Response) {
  const { gender, country_id, age_group } = req.query as {
    gender?: string;
    country_id?: string;
    age_group?: string;
  };

  try {
    const profiles = await findAll({ gender, country_id, age_group });
    const data = profiles.map(({ id, name, gender, age, age_group, country_id }) => ({
      id,
      name,
      gender,
      age,
      age_group,
      country_id,
    }));
    return res.status(200).json({
      status: "success",
      count: data.length,
      data,
    });
  } catch {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
}

export async function deleteProfile(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    await removeById(id);
    return res.sendStatus(204);
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res
        .status(404)
        .json({ status: "error", message: "Profile not found" });
    }
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
}
