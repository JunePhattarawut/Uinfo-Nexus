-- Codex: add iconEmoji, isPrivate, createdBy to spaces
ALTER TABLE "spaces"
  ADD COLUMN "iconEmoji" TEXT NOT NULL DEFAULT '📄',
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';

-- Codex: add emoji to pages
ALTER TABLE "pages"
  ADD COLUMN "emoji" TEXT;
