import { createAuthClient } from "better-auth/react";

// No baseURL: same-origin requests, inferred from the browser at call time.
export const authClient = createAuthClient();
