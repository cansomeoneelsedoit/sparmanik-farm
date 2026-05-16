// Centralized re-exports for Prisma's runtime types so callers don't depend
// on the long `@prisma/client/runtime/library` import path.
import type { PrismaClient } from "@prisma/client";

export { Decimal } from "@prisma/client/runtime/library";
export type {
  InputJsonValue,
  InputJsonObject,
  JsonValue,
} from "@prisma/client/runtime/library";

/**
 * Properly-typed transaction client (Prisma v6's legacy generator types this
 * as `any`, which cascades through callbacks).
 */
export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
