import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: "USER" | "SUPERUSER" | "PORTAL";
    };
  }

  interface User {
    role?: "USER" | "SUPERUSER" | "PORTAL";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "SUPERUSER" | "PORTAL";
  }
}
