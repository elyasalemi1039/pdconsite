-- SQL script to add the link column to the Product table
-- Run this script manually on your database

-- Add the link column (nullable)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "link" TEXT;

-- FUTURE: Add the keywords column for enhanced search (uncomment when ready)
-- After running this, also uncomment the keywords field in prisma/schema.prisma
-- ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "keywords" TEXT;

-- Optional: If you want to also remove the manufacturerDescription column
-- (only run this if you're sure you don't need the data anymore)
-- ALTER TABLE "Product" DROP COLUMN IF EXISTS "manufacturerDescription";

