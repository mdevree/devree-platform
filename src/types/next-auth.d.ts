import "next-auth";

declare module "next-auth" {
  interface Session {
    pushSessionId?: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
  }

  interface User {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    pushSessionId?: string;
    id: string;
    role: string;
  }
}
