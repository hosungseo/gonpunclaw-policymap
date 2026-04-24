import { generateAdminToken, hashAdminToken, verifyAdminToken } from "@/lib/tokens";

export function generateUploadJobToken(): string {
  return generateAdminToken();
}

export function hashUploadJobToken(token: string, pepper: string): string {
  return hashAdminToken(token, pepper);
}

export function verifyUploadJobToken(token: string, hash: string, pepper: string): boolean {
  return verifyAdminToken(token, hash, pepper);
}
