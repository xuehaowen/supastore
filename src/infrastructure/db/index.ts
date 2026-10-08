import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new Error(
      "[Database Configuration Error] DATABASE_URL environment variable is required. Please set it in your .env file.",
    );
  }
}

// Use postgres.js client in direct session mode for transactional row locks (SELECT ... FOR UPDATE)
export const queryClient = postgres(
  connectionString ||
    "postgresql://postgres:postgres@localhost:5432/supastore_inert",
  {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  },
);

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
