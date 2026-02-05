-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create app_service enum for services that can be accessed
CREATE TYPE public.app_service AS ENUM ('codes_checker', 'wlid_claimer', 'xbox_fetcher', 'manus_checker', 'hotmail_validator');

-- Create profiles table for users
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create redeem_codes table for access codes
CREATE TABLE public.redeem_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    services app_service[] NOT NULL DEFAULT '{}',
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on redeem_codes
ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;

-- Create redeemed_codes table to track which users redeemed which codes
CREATE TABLE public.redeemed_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    code_id UUID REFERENCES public.redeem_codes(id) ON DELETE CASCADE NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, code_id)
);

-- Enable RLS on redeemed_codes
ALTER TABLE public.redeemed_codes ENABLE ROW LEVEL SECURITY;

-- Create user_services table to track which services each user has access to
CREATE TABLE public.user_services (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    service app_service NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, service)
);

-- Enable RLS on user_services
ALTER TABLE public.user_services ENABLE ROW LEVEL SECURITY;

-- Create check_history table to track all checker results
CREATE TABLE public.check_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    service app_service NOT NULL,
    input_count INTEGER DEFAULT 0,
    results JSONB DEFAULT '[]',
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on check_history
ALTER TABLE public.check_history ENABLE ROW LEVEL SECURITY;

-- Create has_role function for secure role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Create function to check if user has service access
CREATE OR REPLACE FUNCTION public.has_service_access(_user_id UUID, _service app_service)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_services
        WHERE user_id = _user_id
          AND service = _service
          AND (expires_at IS NULL OR expires_at > now())
    ) OR EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = 'admin'
    )
$$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_redeem_codes_updated_at
    BEFORE UPDATE ON public.redeem_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
    ON public.user_roles FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for redeem_codes
CREATE POLICY "Admins can manage redeem codes"
    ON public.redeem_codes FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active codes"
    ON public.redeem_codes FOR SELECT
    TO authenticated
    USING (is_active = true);

-- RLS Policies for redeemed_codes
CREATE POLICY "Users can view their own redemptions"
    ON public.redeemed_codes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can redeem codes"
    ON public.redeemed_codes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all redemptions"
    ON public.redeemed_codes FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_services
CREATE POLICY "Users can view their own services"
    ON public.user_services FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all services"
    ON public.user_services FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for check_history
CREATE POLICY "Users can view their own history"
    ON public.check_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own history"
    ON public.check_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all history"
    ON public.check_history FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));