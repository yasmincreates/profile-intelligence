import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as any;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});

const db = new PrismaClient({ adapter } as any);

export default db;
