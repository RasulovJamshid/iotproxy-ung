-- Fix users with NULL organization_id
-- Run this directly in the database before running migrations

-- First, check if there are any users with NULL organization_id
SELECT id, email, organization_id FROM users WHERE organization_id IS NULL;

-- Get the first organization (or you can specify a specific one)
-- SELECT id, name FROM organizations;

-- Update users with NULL organization_id to use the first organization
-- Replace this with an actual organization ID from your database
UPDATE users 
SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

-- Verify the fix
SELECT id, email, organization_id FROM users WHERE organization_id IS NULL;
-- Should return 0 rows
