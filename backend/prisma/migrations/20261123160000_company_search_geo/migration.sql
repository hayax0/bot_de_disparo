ALTER TABLE "CompanySearchResult"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "providerKey" TEXT,
  ADD COLUMN "state" TEXT;

CREATE UNIQUE INDEX "CompanySearchResult_searchId_providerKey_key"
  ON "CompanySearchResult"("searchId", "providerKey");
