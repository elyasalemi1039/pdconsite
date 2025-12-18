-- SQL script to add new columns to the Product table
-- Run this script manually on your database
-- If a column already exists, you'll get an error - that's okay, just continue

-- Add the link column (nullable)
ALTER TABLE "Product" ADD COLUMN "link" TEXT;

-- Add brand column for filtering
ALTER TABLE "Product" ADD COLUMN "brand" TEXT;

-- Add nickname column for filtering
ALTER TABLE "Product" ADD COLUMN "nickname" TEXT;

-- Add keywords column for enhanced search (comma-separated values)
ALTER TABLE "Product" ADD COLUMN "keywords" TEXT;

