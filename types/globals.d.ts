export {};

declare global {
  /* Clerk session token claims. Requires the session token customization in
     the Clerk Dashboard: Sessions → Customize session token →
     { "metadata": "{{user.public_metadata}}" } */
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: "admin" | "instructor" | "student";
    };
  }
}
