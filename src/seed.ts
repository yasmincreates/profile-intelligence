import "dotenv/config";
import { randomBytes } from "crypto";
import db from "./db";
import * as path from "path";
import * as fs from "fs";

function uuidv7(): string {
  const now = Date.now();
  const buf = randomBytes(16);
  buf[0] = (now / 2 ** 40) & 0xff;
  buf[1] = (now / 2 ** 32) & 0xff;
  buf[2] = (now / 2 ** 24) & 0xff;
  buf[3] = (now / 2 ** 16) & 0xff;
  buf[4] = (now / 2 **  8) & 0xff;
  buf[5] =  now             & 0xff;
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = buf.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function seed() {
  const filePath = path.join(__dirname, "..", "seed_profiles.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const { profiles } = JSON.parse(raw);

  console.log(`Seeding ${profiles.length} profiles...`);

  // Fetch all existing names to skip duplicates
  const existing = await db.profile.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((p: any) => p.name));

  const toInsert = profiles
    .filter((p: any) => !existingNames.has(p.name))
    .map((p: any) => ({
      id: uuidv7(),
      name: p.name,
      gender: p.gender,
      gender_probability: p.gender_probability,
      age: p.age,
      age_group: p.age_group,
      country_id: p.country_id,
      country_name: p.country_name,
      country_probability: p.country_probability,
    }));

  if (toInsert.length === 0) {
    console.log("All profiles already exist — nothing to insert.");
    await db.$disconnect();
    return;
  }

  // Insert in batches of 100 to avoid query size limits
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    await db.profile.createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}...`);
  }

  console.log(`\nDone. Inserted: ${toInsert.length}, Skipped (already existed): ${existingNames.size}`);
  await db.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
