CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'pic')::public.user_role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
