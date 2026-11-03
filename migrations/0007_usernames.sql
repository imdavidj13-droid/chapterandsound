-- Stable, case-insensitive public usernames are owned by Better Auth.
-- Better Auth's username plugin enforces uniqueness on the user table.
ALTER TABLE "user" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_username ON "user"("username" COLLATE NOCASE) WHERE "username" IS NOT NULL;
-- The application profile exposes the same identity for public links and reviews.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_member_handle_ci ON members(handle COLLATE NOCASE) WHERE handle IS NOT NULL;
