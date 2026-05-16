// Re-export the existing singleton so the new src/server/ layout can import it
// from a stable path. The actual singleton lives in src/lib/prisma.ts.
export { prisma } from "@/lib/prisma";
