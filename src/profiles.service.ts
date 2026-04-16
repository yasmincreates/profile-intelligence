import axios from "axios";
import { randomBytes } from "crypto";
import db from "./db";

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
  // Check if profile already exists
  const existing = await db.profile.findUnique({
    where: { name: name.toLowerCase() },
  });
  if (existing) {
    return { alreadyExists: true, data: formatProfile(existing) };
  }

  // Call all 3 APIs in parallel
  const [genderRes, agifyRes, nationalizeRes] = await Promise.allSettled([
    axios.get(`https://api.genderize.io?name=${encodeURIComponent(name)}`),
    axios.get(`https://api.agify.io?name=${encodeURIComponent(name)}`),
    axios.get(`https://api.nationalize.io?name=${encodeURIComponent(name)}`),
  ]);

  // Handle Genderize
  if (genderRes.status === "rejected") {
    throw { code: 502, api: "Genderize" };
  }
  const genderData = genderRes.value.data;
  if (!genderData.gender || genderData.count === 0) {
    throw { code: 502, api: "Genderize" };
  }

  // Handle Agify
  if (agifyRes.status === "rejected") {
    throw { code: 502, api: "Agify" };
  }
  const agifyData = agifyRes.value.data;
  if (agifyData.age == null) {
    throw { code: 502, api: "Agify" };
  }

  // Handle Nationalize
  if (nationalizeRes.status === "rejected") {
    throw { code: 502, api: "Nationalize" };
  }
  const nationalizeData = nationalizeRes.value.data;
  if (!nationalizeData.country || nationalizeData.country.length === 0) {
    throw { code: 502, api: "Nationalize" };
  }

  // Process data
  const gender: string = genderData.gender;
  const gender_probability: number = genderData.probability;
  const sample_size: number = genderData.count;

  const age: number = agifyData.age;
  const age_group: string = getAgeGroup(age);

  // Pick country with highest probability
  const topCountry = nationalizeData.country.reduce(
    (best: any, current: any) =>
      current.probability > best.probability ? current : best,
  );
  const country_id: string = topCountry.country_id;
  const country_probability: number = topCountry.probability;

  // Store in database
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
}) {
  const where: any = {};

  if (filters.gender) {
    where.gender = {
      equals: filters.gender.toLowerCase(),
      mode: "insensitive",
    };
  }
  if (filters.country_id) {
    where.country_id = {
      equals: filters.country_id.toUpperCase(),
      mode: "insensitive",
    };
  }
  if (filters.age_group) {
    where.age_group = {
      equals: filters.age_group.toLowerCase(),
      mode: "insensitive",
    };
  }

  const profiles = await db.profile.findMany({ where });
  return profiles.map(formatProfile);
}

export async function removeById(id: string) {
  return db.profile.delete({ where: { id } });
}
