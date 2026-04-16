import axios from "axios";
import { v7 as uuidv7 } from "uuid";
import db from "./db";

function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

export async function enrichAndStore(name: string) {
  // Check if profile already exists
  const existing = await db.profile.findUnique({
    where: { name: name.toLowerCase() },
  });
  if (existing) {
    return { alreadyExists: true, data: existing };
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

  return { alreadyExists: false, data: profile };
}

export async function findById(id: string) {
  return db.profile.findUnique({ where: { id } });
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

  return db.profile.findMany({ where });
}

export async function removeById(id: string) {
  return db.profile.delete({ where: { id } });
}
