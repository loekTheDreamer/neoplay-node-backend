/*
  Warnings:

  - You are about to drop the column `coverImageUrl` on the `Game` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "coverImageUrl",
ADD COLUMN     "publishedAt" TIMESTAMP(3);
