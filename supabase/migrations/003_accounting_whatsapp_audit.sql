-- 1. Table `vehicle_expenses`
CREATE TABLE vehicle_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    expense_category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    paid_by TEXT NOT NULL DEFAULT 'office',
    deduct_from_driver_share BOOLEAN NOT NULL DEFAULT false,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    receipt_url TEXT,
    entered_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table `financial_transactions`
CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type TEXT NOT NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    balance_effect_on_driver NUMERIC(10,2) NOT NULL,
    payment_method_code TEXT DEFAULT 'cash',
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT NOT NULL,
    entered_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table `whatsapp_sessions`
CREATE TABLE whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_phone TEXT NOT NULL,
    whatsapp_business_number TEXT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    session_status TEXT NOT NULL DEFAULT 'awaiting_info',
    detected_intent TEXT DEFAULT 'unknown',
    extracted_customer_name TEXT,
    extracted_pickup TEXT,
    extracted_pickup_lat DOUBLE PRECISION,
    extracted_pickup_lng DOUBLE PRECISION,
    extracted_destination TEXT,
    extracted_destination_lat DOUBLE PRECISION,
    extracted_destination_lng DOUBLE PRECISION,
    extracted_time TEXT,
    extracted_passengers INT DEFAULT 1,
    extracted_notes TEXT,
    missing_fields TEXT[] DEFAULT '{}',
    ai_confidence_score NUMERIC(4,2) DEFAULT 1.00,
    suggested_operator_reply TEXT,
    linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table `whatsapp_messages`
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    wa_message_id TEXT UNIQUE,
    direction TEXT NOT NULL,
    message_type TEXT NOT NULL,
    raw_text TEXT,
    audio_media_url TEXT,
    voice_transcription_ar TEXT,
    voice_translation_en TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Table `dialect_landmarks`
CREATE TABLE dialect_landmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spoken_phrase TEXT NOT NULL,
    normalized_place_name TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
);

INSERT INTO dialect_landmarks (spoken_phrase, normalized_place_name, lat, lng) VALUES
    ('المطار', 'Beirut Rafic Hariri International Airport', 33.8213, 35.4883),
    ('matar', 'Beirut Rafic Hariri International Airport', 33.8213, 35.4883),
    ('مار مخايل', 'Mar Mikhael, Beirut', 33.8972, 35.5269),
    ('mar mikhael', 'Mar Mikhael, Beirut', 33.8972, 35.5269),
    ('الحمرا', 'Hamra Street, Beirut', 33.8961, 35.4812),
    ('hamra', 'Hamra Street, Beirut', 33.8961, 35.4812),
    ('الدورة', 'Dora Roundabout', 33.8920, 35.5414),
    ('dawra', 'Dora Roundabout', 33.8920, 35.5414),
    ('جونيه', 'Jounieh Highway', 33.9840, 35.6171),
    ('jounieh', 'Jounieh Highway', 33.9840, 35.6171);

-- 6. Table `activity_logs`
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Enable Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE orders, drivers, whatsapp_sessions, whatsapp_messages;
