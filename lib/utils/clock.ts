import { cache } from "react";

/* The time this request is being served at, for server components that
   compare against due dates (feature 20). One value per request, so every
   part of a page agrees, and render stays idempotent (react-hooks/purity
   rejects Date.now() in a component body). Server components only. */
export const requestTime = cache((): number => Date.now());
