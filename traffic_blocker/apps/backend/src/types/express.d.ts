import type { ShopDoc } from "../models/index.js";

declare global {
  namespace Express {
    interface Request {
      shop?: ShopDoc;
    }
  }
}

export {};
