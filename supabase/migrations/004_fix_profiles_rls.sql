-- Drop the old recursive policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

-- Create a safe, non-recursive policy for selecting profiles
CREATE POLICY "Authenticated users can read all profiles" ON profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);
