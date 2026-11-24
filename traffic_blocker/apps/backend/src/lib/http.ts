import type { Response } from "express";

export function sendData<T>(res: Response, data: T, status = 200, meta?: { page: number; pageSize: number; total: number }): void {
  res.status(status).json(meta ? { ok: true, data, meta } : { ok: true, data });
}

export function parsePage(query: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number } {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25) || 25));
  return { page, pageSize };
}
