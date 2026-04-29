import { Request, Response } from "express";
import {
  enrichAndStore,
  findById,
  findAll,
  removeById,
} from "./profiles.service";
import { parseNLQuery } from "./nlParser";

export async function createProfile(req: Request, res: Response) {
  const { name } = req.body;

  if (!name || name === "") {
    return res.status(400).json({ status: "error", message: "Missing or empty name" });
  }
  if (typeof name !== "string") {
    return res.status(422).json({ status: "error", message: "name must be a string" });
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

    return res.status(201).json({ status: "success", data: result.data });
  } catch (err: any) {
    if (err.code === 502) {
      return res.status(502).json({
        status: "502",
        message: `${err.api} returned an invalid response`,
      });
    }
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

export async function getProfileById(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const profile = await findById(id);
    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.status(200).json({ status: "success", data: profile });
  } catch {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

function buildPaginatedResponse(
  req: Request,
  result: { data: any[]; total: number; page: number; limit: number },
  extraParams: Record<string, string> = {}
) {
  const { data, total, page, limit } = result;
  const total_pages = Math.ceil(total / limit);

  const base = req.baseUrl + req.path;
  const buildLink = (p: number) => {
    const params = new URLSearchParams({ ...extraParams, page: String(p), limit: String(limit) });
    return `${base}?${params.toString()}`;
  };

  return {
    status: "success",
    page,
    limit,
    total,
    total_pages,
    links: {
      self: buildLink(page),
      next: page < total_pages ? buildLink(page + 1) : null,
      prev: page > 1 ? buildLink(page - 1) : null,
    },
    data,
  };
}

function parseListParams(query: Record<string, string | undefined>) {
  const {
    gender, country_id, age_group, min_age, max_age,
    min_gender_probability, min_country_probability,
    sort_by, order, page, limit,
  } = query;

  return {
    gender,
    country_id,
    age_group,
    min_age: min_age !== undefined ? Number(min_age) : undefined,
    max_age: max_age !== undefined ? Number(max_age) : undefined,
    min_gender_probability: min_gender_probability !== undefined ? Number(min_gender_probability) : undefined,
    min_country_probability: min_country_probability !== undefined ? Number(min_country_probability) : undefined,
    sort_by: sort_by as any,
    order: order as any,
    page: page !== undefined ? Number(page) : undefined,
    limit: limit !== undefined ? Number(limit) : undefined,
  };
}

function validateNumericParams(params: Record<string, string | undefined>): string | null {
  const numericFields = ["min_age", "max_age", "min_gender_probability", "min_country_probability", "page", "limit"];
  for (const key of numericFields) {
    const val = params[key];
    if (val !== undefined && (isNaN(Number(val)) || val.trim() === "")) {
      return `${key} must be a number`;
    }
  }
  return null;
}

export async function getAllProfiles(req: Request, res: Response) {
  const query = req.query as Record<string, string | undefined>;
  const validationError = validateNumericParams(query);
  if (validationError) return res.status(422).json({ status: "error", message: validationError });

  const { sort_by, order } = query;
  const validSortFields = ["age", "created_at", "gender_probability"];
  if (sort_by && !validSortFields.includes(sort_by)) {
    return res.status(422).json({ status: "error", message: "sort_by must be one of: age, created_at, gender_probability" });
  }
  if (order && order !== "asc" && order !== "desc") {
    return res.status(422).json({ status: "error", message: "order must be asc or desc" });
  }

  try {
    const result = await findAll(parseListParams(query));
    const extraParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) {
      if (v && k !== "page" && k !== "limit") extraParams[k] = v;
    }
    return res.status(200).json(buildPaginatedResponse(req, result, extraParams));
  } catch {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

export async function searchProfiles(req: Request, res: Response) {
  const { q, page, limit } = req.query as Record<string, string | undefined>;

  if (!q || q.trim() === "") {
    return res.status(400).json({ status: "error", message: "Missing or empty parameter" });
  }

  const filters = parseNLQuery(q);
  if (!filters) {
    return res.status(400).json({ status: "error", message: "Unable to interpret query" });
  }

  for (const [key, val] of Object.entries({ page, limit })) {
    if (val !== undefined && (isNaN(Number(val)) || val.trim() === "")) {
      return res.status(422).json({ status: "error", message: `${key} must be a number` });
    }
  }

  try {
    const result = await findAll({
      ...filters,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return res.status(200).json(buildPaginatedResponse(req, result, { q: q! }));
  } catch {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

export async function exportProfiles(req: Request, res: Response) {
  const query = req.query as Record<string, string | undefined>;

  try {
    const result = await findAll({ ...parseListParams(query), limit: 10000, page: 1 });

    const COLS = [
      "id", "name", "gender", "gender_probability", "age", "age_group",
      "country_id", "country_name", "country_probability", "created_at",
    ];

    const escape = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = result.data.map((p) => COLS.map((c) => escape(p[c])).join(","));
    const csv = [COLS.join(","), ...rows].join("\n");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="profiles_${timestamp}.csv"`);
    return res.status(200).send(csv);
  } catch {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

export async function deleteProfile(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    await removeById(id);
    return res.sendStatus(204);
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}
