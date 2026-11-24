import mongoose from "mongoose";
import { Redis } from "ioredis";
import { logger } from "./logger.js";

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info("MongoDB connected");
  return mongoose;
}

export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}
