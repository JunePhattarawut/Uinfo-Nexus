-- M3 Uinfo Codex: page comments share the comments table with issue comments.
ALTER TABLE "comments" ADD COLUMN "pageId" TEXT;
ALTER TABLE "comments" ALTER COLUMN "issueId" DROP NOT NULL;
CREATE INDEX "comments_pageId_idx" ON "comments"("pageId");
ALTER TABLE "comments" ADD CONSTRAINT "comments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
