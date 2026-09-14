/**
 * The session cookie name, in its own module so the edge middleware can import
 * it without pulling in the Node-only auth module (bcrypt, prisma, next/headers).
 */
export const SESSION_COOKIE = "aitalk_session";
