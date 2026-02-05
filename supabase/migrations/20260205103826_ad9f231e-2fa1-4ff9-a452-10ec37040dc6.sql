-- Create a trigger to automatically grant admin to specific email
CREATE OR REPLACE FUNCTION public.grant_admin_to_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if the user's email is the admin email
    IF NEW.email = 'gamet4821@gmail.com' THEN
        -- Grant admin role
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Grant all services
        INSERT INTO public.user_services (user_id, service)
        VALUES 
            (NEW.id, 'codes_checker'),
            (NEW.id, 'wlid_claimer'),
            (NEW.id, 'xbox_fetcher'),
            (NEW.id, 'manus_checker'),
            (NEW.id, 'hotmail_validator')
        ON CONFLICT (user_id, service) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created_admin
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.grant_admin_to_email();