-- Better Auth core schema for the D1 native SQLite adapter (v1.7 contract).
-- These singular tables are separate from the application's members/sessions tables.
-- Before production use, validate this schema against the installed Better Auth CLI.
CREATE TABLE IF NOT EXISTS "user" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "name" TEXT NOT NULL,
 "email" TEXT NOT NULL UNIQUE,
 "emailVerified" INTEGER NOT NULL DEFAULT 0,
 "image" TEXT,
 "createdAt" INTEGER NOT NULL,
 "updatedAt" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "session" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "expiresAt" INTEGER NOT NULL,
 "token" TEXT NOT NULL UNIQUE,
 "createdAt" INTEGER NOT NULL,
 "updatedAt" INTEGER NOT NULL,
 "ipAddress" TEXT,
 "userAgent" TEXT,
 "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_session_user ON "session"("userId");
CREATE TABLE IF NOT EXISTS "account" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "accountId" TEXT NOT NULL,
 "providerId" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "accessToken" TEXT,
 "refreshToken" TEXT,
 "idToken" TEXT,
 "accessTokenExpiresAt" INTEGER,
 "refreshTokenExpiresAt" INTEGER,
 "scope" TEXT,
 "password" TEXT,
 "createdAt" INTEGER NOT NULL,
 "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_account_user ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_auth_account_provider ON "account"("providerId","accountId");
CREATE TABLE IF NOT EXISTS "verification" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "identifier" TEXT NOT NULL,
 "value" TEXT NOT NULL,
 "expiresAt" INTEGER NOT NULL,
 "createdAt" INTEGER,
 "updatedAt" INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auth_verification_identifier ON "verification"("identifier");
