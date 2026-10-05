-- 1. Custom Enums
CREATE TYPE order_source AS ENUM ('whatsapp_1', 'whatsapp_2', 'phone_call', 'manual', 'web_app');
CREATE TYPE order_status AS ENUM ('ai_draft', 'pending', 'assigned', 'accepted', 'on_the_way', 'arrived', 'picked_up', 'completed', 'cancelled');
CREATE TYPE settlement_flow AS ENUM ('driver_collects_cash', 'office_receives_digital_or_credit');

-- 2. Table `payment_methods`
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    settlement_type settlement_flow NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Seed default payment methods
INSERT INTO payment_methods (code, display_name, settlement_type) VALUES
    ('cash', 'Cash', 'driver_collects_cash'),
    ('credit', 'Credit / Corporate', 'office_receives_digital_or_credit'),
    ('wish', 'Whish Money', 'office_receives_digital_or_credit');

-- 3. Table `pricing_rules`
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'sedan',
    base_fare NUMERIC(10,2) NOT NULL DEFAULT 2.00,
    price_per_km NUMERIC(10,2) NOT NULL DEFAULT 0.50,
    minimum_fare NUMERIC(10,2) NOT NULL DEFAULT 4.00,
    night_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.25,
    night_start_hour INT NOT NULL DEFAULT 22,
    night_end_hour INT NOT NULL DEFAULT 6,
    extra_stop_fee NUMERIC(10,2) NOT NULL DEFAULT 2.00,
    waiting_fee_per_15min NUMERIC(10,2) NOT NULL DEFAULT 1.50,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default pricing rules
INSERT INTO pricing_rules (name, vehicle_type, base_fare, price_per_km, minimum_fare) VALUES
    ('Standard Sedan Tariff', 'sedan', 2.00, 0.50, 4.00),
    ('SUV / Van Tariff', 'suv', 4.00, 0.80, 7.00);

-- 4. Table `customers`
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT,
    default_pickup_address TEXT,
    default_pickup_lat DOUBLE PRECISION,
    default_pickup_lng DOUBLE PRECISION,
    frequent_destinations JSONB DEFAULT '[]'::jsonb,
    preferred_payment_method TEXT DEFAULT 'cash',
    total_trips INT NOT NULL DEFAULT 0,
    total_spend NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    last_order_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Table `orders`
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number SERIAL UNIQUE,
    source order_source NOT NULL DEFAULT 'manual',
    whatsapp_line_number TEXT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    pickup_address TEXT NOT NULL,
    pickup_lat DOUBLE PRECISION NULL,
    pickup_lng DOUBLE PRECISION NULL,
    destination_address TEXT NOT NULL,
    destination_lat DOUBLE PRECISION NULL,
    destination_lng DOUBLE PRECISION NULL,
    distance_km NUMERIC(8,2) DEFAULT 0,
    estimated_duration_min INT DEFAULT 0,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    passengers INT NOT NULL DEFAULT 1,
    vehicle_type_requested TEXT NOT NULL DEFAULT 'sedan',
    notes TEXT,
    calculated_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
    extra_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method_code TEXT NOT NULL DEFAULT 'cash' REFERENCES payment_methods(code),
    assigned_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'pending',
    applied_office_pct NUMERIC(5,2) DEFAULT 0,
    applied_driver_pct NUMERIC(5,2) DEFAULT 0,
    office_share_amount NUMERIC(10,2) DEFAULT 0,
    driver_share_amount NUMERIC(10,2) DEFAULT 0,
    driver_net_balance_impact NUMERIC(10,2) DEFAULT 0,
    assigned_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
