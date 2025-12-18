-- SQL script to add new columns to the Product table
-- Run this script manually on your database

-- Add the link column (nullable)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "link" TEXT;

-- Add brand column for filtering
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT;

-- Add nickname column for filtering
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "nickname" TEXT;

-- Add keywords column for enhanced search (comma-separated values)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "keywords" TEXT;

-- Optional: If you want to also remove the manufacturerDescription column
-- (only run this if you're sure you don't need the data anymore)
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "manufacturerDescription";

