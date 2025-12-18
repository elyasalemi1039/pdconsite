-- SQL script to modify the Product table
-- Run this script manually on your database
-- 
-- IMPORTANT: If a column already exists or doesn't exist, you may get an error.
-- That's okay! Just skip that line and continue with the next one.
--
-- Run each ALTER TABLE statement one at a time if needed.

-- Add the link column (nullable)
ALTER TABLE "Product" ADD COLUMN "link" TEXT;

-- Add brand column for filtering
ALTER TABLE "Product" ADD COLUMN "brand" TEXT;

-- Add nickname column for filtering
ALTER TABLE "Product" ADD COLUMN "nickname" TEXT;

-- Add keywords column for enhanced search (comma-separated values)
ALTER TABLE "Product" ADD COLUMN "keywords" TEXT;

-- DROP price column (no longer used)
ALTER TABLE "Product" DROP COLUMN IF EXISTS "price";

