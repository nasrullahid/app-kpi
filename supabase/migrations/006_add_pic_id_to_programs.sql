-- Add pic_id to link programs directly to the profiles table
ALTER TABLE programs ADD COLUMN pic_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
