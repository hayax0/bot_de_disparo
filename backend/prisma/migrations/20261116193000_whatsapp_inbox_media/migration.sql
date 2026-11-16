-- CreateTable
CREATE TABLE "WhatsappInboxAttachment" (
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "WhatsappInboxAttachment_pkey" PRIMARY KEY ("messageId")
);

-- AddForeignKey
ALTER TABLE "WhatsappInboxAttachment" ADD CONSTRAINT "WhatsappInboxAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsappInboxMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
