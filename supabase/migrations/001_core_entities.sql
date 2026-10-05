-- 1. Custom Enums
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'accounting', 'driver');
CREATE TYPE driver_availability AS ENUM ('offline', 'available', 'busy');

-- 2. Table `profiles`
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'operator',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table `driver_categories`
CREATE TABLE driver_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    default_office_commission_pct NUMERIC(5,2) NOT NULL,
    default_driver_commission_pct NUMERIC(5,2) NOT NULL,
    is_company_vehicle_category BOOLEAN DEFAULT false,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default categories
INSERT INTO driver_categories (name, default_office_commission_pct, default_driver_commission_pct, is_company_vehicle_category, description)
VALUES 
    ('Company Car Driver', 50.00, 50.00, true, 'Uses company owned vehicles'),
    ('Joker Driver', 15.00, 85.00, false, 'Uses private vehicle, occasional shifts'),
    ('Office Driver', 20.00, 80.00, false, 'Uses private vehicle, regular shifts');

-- 4. Table `vehicles`
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number TEXT NOT NULL UNIQUE,
    make_model TEXT NOT NULL,
    year INT,
    color TEXT,
    vehicle_type TEXT NOT NULL DEFAULT 'sedan',
    is_company_owned BOOLEAN NOT NULL DEFAULT true,
    custom_company_pct NUMERIC(5,2) NULL,
    custom_driver_pct NUMERIC(5,2) NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Table `drivers`
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    driver_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    category_id UUID NOT NULL REFERENCES driver_categories(id),
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    private_vehicle_details TEXT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'sedan',
    custom_office_pct_override NUMERIC(5,2) NULL,
    availability driver_availability NOT NULL DEFAULT 'offline',
    current_lat DOUBLE PRECISION NULL,
    current_lng DOUBLE PRECISION NULL,
    last_gps_update TIMESTAMPTZ NULL,
    secure_access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
