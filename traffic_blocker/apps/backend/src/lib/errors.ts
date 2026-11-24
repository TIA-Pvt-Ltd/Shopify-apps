export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(message = "Resource not found"): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function forbidden(message = "Forbidden"): HttpError {
  return new HttpError(403, "FORBIDDEN", message);
}

export function unauthorized(message = "Authentication required"): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, "BAD_REQUEST", message, details);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, "CONFLICT", message);
}

export function paymentRequired(message: string): HttpError {
  return new HttpError(402, "PLAN_LIMIT", message);
}
