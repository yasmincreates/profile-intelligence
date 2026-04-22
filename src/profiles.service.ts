import axios from "axios";
import { randomBytes } from "crypto";
import db from "./db";
import { COUNTRY_NAMES } from "./countries";

function uuidv7(): string {
  const now = Date.now();
  const buf = randomBytes(16);
  buf[0] = (now / 2 ** 40) & 0xff;
  buf[1] = (now / 2 ** 32) & 0xff;
  buf[2] = (now / 2 ** 24) & 0xff;
  buf[3] = (now / 2 ** 16) & 0xff;
  buf[4] = (now / 2 **  8) & 0xff;
  buf[5] =  now             & 0xff;
  buf[6] = (buf[6] & 0x0f) | 0x70; // version 7
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10xx
  const h = buf.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function formatProfile(profile: any) {
  return {
    ...profile,
    created_at: profile.created_at instanceof Date
      ? profile.created_at.toISOString().replace(/\.\d{3}Z$/, "Z")
      : profile.created_at,
  };
}

export async function enrichAndStore(name: string) {
  const existing = await db.profile.findUnique({
    where: { name: name.toLowerCase() },
  });
  if (existing) {
    return { alreadyExists: true, data: formatProfile(existing) };
  }

  const [genderRes, agifyRes, nationalizeRes] = await Promise.allSettled([
    axios.get(`https://api.genderize.io?name=${encodeURIComponent(name)}`),
    axios.get(`https://api.agify.io?name=${encodeURIComponent(name)}`),
    axios.get(`https://api.nationalize.io?name=${encodeURIComponent(name)}`),
  ]);

  if (genderRes.status === "rejected") throw { code: 502, api: "Genderize" };
  const genderData = genderRes.value.data;
  if (!genderData.gender || genderData.count === 0) throw { code: 502, api: "Genderize" };

  if (agifyRes.status === "rejected") throw { code: 502, api: "Agify" };
  const agifyData = agifyRes.value.data;
  if (agifyData.age == null) throw { code: 502, api: "Agify" };

  if (nationalizeRes.status === "rejected") throw { code: 502, api: "Nationalize" };
  const nationalizeData = nationalizeRes.value.data;
  if (!nationalizeData.country || nationalizeData.country.length === 0) throw { code: 502, api: "Nationalize" };

  const gender: string = genderData.gender;
  const gender_probability: number = genderData.probability;
  const sample_size: number = genderData.count;

  const age: number = agifyData.age;
  const age_group: string = getAgeGroup(age);

  const topCountry = nationalizeData.country.reduce(
    (best: any, current: any) =>
      current.probability > best.probability ? current : best,
  );
  const country_id: string = topCountry.country_id;
  const country_probability: number = topCountry.probability;
  const country_name: string = COUNTRY_NAMES[country_id] ?? country_id;

  const profile = await db.profile.create({
    data: {
      id: uuidv7(),
      name: name.toLowerCase(),
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
    },
  });

  return { alreadyExists: false, data: formatProfile(profile) };
}

export async function findById(id: string) {
  const profile = await db.profile.findUnique({ where: { id } });
  return profile ? formatProfile(profile) : null;
}

export async function findAll(filters: {
  gender?: string;
  country_id?: string;
  age_group?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
  sort_by?: "age" | "created_at" | "gender_probability";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}) {
  const where: any = {};

  if (filters.gender) {
    where.gender = { equals: filters.gender.toLowerCase(), mode: "insensitive" };
  }
  if (filters.country_id) {
    where.country_id = { equals: filters.country_id.toUpperCase(), mode: "insensitive" };
  }
  if (filters.age_group) {
    where.age_group = { equals: filters.age_group.toLowerCase(), mode: "insensitive" };
  }
  if (filters.min_age !== undefined || filters.max_age !== undefined) {
    where.age = {};
    if (filters.min_age !== undefined) where.age.gte = filters.min_age;
    if (filters.max_age !== undefined) where.age.lte = filters.max_age;
  }
  if (filters.min_gender_probability !== undefined) {
    where.gender_probability = { gte: filters.min_gender_probability };
  }
  if (filters.min_country_probability !== undefined) {
    where.country_probability = { gte: filters.min_country_probability };
  }

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const sortField = filters.sort_by ?? "created_at";
  const sortOrder = filters.order ?? "asc";
  const orderBy = { [sortField]: sortOrder };

  const [profiles, total] = await Promise.all([
    db.profile.findMany({ where, orderBy, skip, take: limit }),
    db.profile.count({ where }),
  ]);

  return {
    data: profiles.map(formatProfile),
    total,
    page,
    limit,
  };
}

export async function removeById(id: string) {
  return db.profile.delete({ where: { id } });
}
