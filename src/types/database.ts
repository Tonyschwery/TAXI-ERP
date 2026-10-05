export type UserRole = 'admin' | 'operator' | 'accounting' | 'driver';
export type DriverAvailability = 'offline' | 'available' | 'busy';
export type OrderSource = 'whatsapp_1' | 'whatsapp_2' | 'phone_call' | 'manual' | 'web_app';
export type OrderStatus = 'ai_draft' | 'pending' | 'assigned' | 'accepted' | 'on_the_way' | 'arrived' | 'picked_up' | 'completed' | 'cancelled';
export type SettlementFlow = 'driver_collects_cash' | 'office_receives_digital_or_credit';

export interface Profile {
  id: string; // UUID from auth.users
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface DriverCategory {
  id: string; // UUID
  name: string;
  default_office_commission_pct: number;
  default_driver_commission_pct: number;
  is_company_vehicle_category: boolean;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string; // UUID
  plate_number: string;
  make_model: string;
  year: number | null;
  color: string | null;
  vehicle_type: string;
  is_company_owned: boolean;
  custom_company_pct: number | null;
  custom_driver_pct: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Driver {
  id: string; // UUID
  profile_id: string | null;
  driver_code: string;
  full_name: string;
  phone: string;
  category_id: string;
  assigned_vehicle_id: string | null;
  private_vehicle_details: string | null;
  vehicle_type: string;
  custom_office_pct_override: number | null;
  availability: DriverAvailability;
  current_lat: number | null;
  current_lng: number | null;
  last_gps_update: string | null;
  secure_access_token: string;
  is_active: boolean;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  code: string;
  display_name: string;
  settlement_type: SettlementFlow;
  is_active: boolean;
}

export interface PricingRule {
  id: string;
  name: string;
  vehicle_type: string;
  base_fare: number;
  price_per_km: number;
  minimum_fare: number;
  night_multiplier: number;
  night_start_hour: number;
  night_end_hour: number;
  extra_stop_fee: number;
  waiting_fee_per_15min: number;
  is_active: boolean;
  updated_at: string;
}

export interface Customer {
  id: string;
  phone: string;
  full_name: string | null;
  default_pickup_address: string | null;
  default_pickup_lat: number | null;
  default_pickup_lng: number | null;
  frequent_destinations: any; // JSONB
  preferred_payment_method: string | null;
  total_trips: number;
  total_spend: number;
  notes: string | null;
  last_order_at: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  source: OrderSource;
  whatsapp_line_number: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  estimated_duration_min: number | null;
  scheduled_at: string;
  passengers: number;
  vehicle_type_requested: string;
  notes: string | null;
  calculated_fare: number;
  extra_charges: number;
  final_fare: number;
  payment_method_code: string;
  assigned_driver_id: string | null;
  assigned_vehicle_id: string | null;
  status: OrderStatus;
  applied_office_pct: number | null;
  applied_driver_pct: number | null;
  office_share_amount: number | null;
  driver_share_amount: number | null;
  driver_net_balance_impact: number | null;
  assigned_at: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleExpense {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  expense_category: string;
  amount: number;
  paid_by: string;
  deduct_from_driver_share: boolean;
  expense_date: string;
  description: string | null;
  receipt_url: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface FinancialTransaction {
  id: string;
  transaction_type: string;
  driver_id: string | null;
  vehicle_id: string | null;
  order_id: string | null;
  amount: number;
  balance_effect_on_driver: number;
  payment_method_code: string | null;
  transaction_date: string;
  description: string;
  entered_by: string | null;
  created_at: string;
}

export interface WhatsappSession {
  id: string;
  customer_phone: string;
  whatsapp_business_number: string;
  customer_id: string | null;
  session_status: string;
  detected_intent: string | null;
  extracted_customer_name: string | null;
  extracted_pickup: string | null;
  extracted_pickup_lat: number | null;
  extracted_pickup_lng: number | null;
  extracted_destination: string | null;
  extracted_destination_lat: number | null;
  extracted_destination_lng: number | null;
  extracted_time: string | null;
  extracted_passengers: number | null;
  extracted_notes: string | null;
  missing_fields: string[] | null;
  ai_confidence_score: number | null;
  suggested_operator_reply: string | null;
  linked_order_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface WhatsappMessage {
  id: string;
  session_id: string;
  wa_message_id: string | null;
  direction: string;
  message_type: string;
  raw_text: string | null;
  audio_media_url: string | null;
  voice_transcription_ar: string | null;
  voice_translation_en: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface DialectLandmark {
  id: string;
  spoken_phrase: string;
  normalized_place_name: string;
  lat: number | null;
  lng: number | null;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  details: any; // JSONB
  created_at: string;
}

// Full Supabase Database type mapping
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'is_active' | 'role'> & { created_at?: string; is_active?: boolean; role?: UserRole };
        Update: Partial<Omit<Profile, 'id'>>;
      };
      driver_categories: {
        Row: DriverCategory;
        Insert: Omit<DriverCategory, 'id' | 'created_at' | 'is_active' | 'is_company_vehicle_category'> & { id?: string, created_at?: string, is_active?: boolean, is_company_vehicle_category?: boolean };
        Update: Partial<Omit<DriverCategory, 'id'>>;
      };
      vehicles: {
        Row: Vehicle;
        Insert: Omit<Vehicle, 'id' | 'created_at' | 'is_active' | 'is_company_owned' | 'vehicle_type'> & { id?: string, created_at?: string, is_active?: boolean, is_company_owned?: boolean, vehicle_type?: string };
        Update: Partial<Omit<Vehicle, 'id'>>;
      };
      drivers: {
        Row: Driver;
        Insert: Omit<Driver, 'id' | 'created_at' | 'is_active' | 'availability' | 'secure_access_token' | 'vehicle_type'> & { id?: string, created_at?: string, is_active?: boolean, availability?: DriverAvailability, secure_access_token?: string, vehicle_type?: string };
        Update: Partial<Omit<Driver, 'id'>>;
      };
      payment_methods: {
        Row: PaymentMethod;
        Insert: Omit<PaymentMethod, 'id' | 'is_active'> & { id?: string; is_active?: boolean };
        Update: Partial<Omit<PaymentMethod, 'id'>>;
      };
      pricing_rules: {
        Row: PricingRule;
        Insert: Omit<PricingRule, 'id' | 'updated_at' | 'is_active' | 'vehicle_type' | 'base_fare' | 'price_per_km' | 'minimum_fare' | 'night_multiplier' | 'night_start_hour' | 'night_end_hour' | 'extra_stop_fee' | 'waiting_fee_per_15min'> & { id?: string, updated_at?: string, is_active?: boolean, vehicle_type?: string, base_fare?: number, price_per_km?: number, minimum_fare?: number, night_multiplier?: number, night_start_hour?: number, night_end_hour?: number, extra_stop_fee?: number, waiting_fee_per_15min?: number };
        Update: Partial<Omit<PricingRule, 'id'>>;
      };
      customers: {
        Row: Customer;
        Insert: Omit<Customer, 'id' | 'created_at' | 'frequent_destinations' | 'preferred_payment_method' | 'total_trips' | 'total_spend'> & { id?: string; created_at?: string; frequent_destinations?: any; preferred_payment_method?: string; total_trips?: number; total_spend?: number };
        Update: Partial<Omit<Customer, 'id'>>;
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'order_number' | 'source' | 'distance_km' | 'estimated_duration_min' | 'scheduled_at' | 'passengers' | 'vehicle_type_requested' | 'calculated_fare' | 'extra_charges' | 'final_fare' | 'payment_method_code' | 'status' | 'applied_office_pct' | 'applied_driver_pct' | 'office_share_amount' | 'driver_share_amount' | 'driver_net_balance_impact'> & { id?: string; created_at?: string; updated_at?: string; order_number?: number; source?: OrderSource; distance_km?: number; estimated_duration_min?: number; scheduled_at?: string; passengers?: number; vehicle_type_requested?: string; calculated_fare?: number; extra_charges?: number; final_fare?: number; payment_method_code?: string; status?: OrderStatus; applied_office_pct?: number; applied_driver_pct?: number; office_share_amount?: number; driver_share_amount?: number; driver_net_balance_impact?: number };
        Update: Partial<Omit<Order, 'id' | 'order_number'>>;
      };
      vehicle_expenses: {
        Row: VehicleExpense;
        Insert: Omit<VehicleExpense, 'id' | 'created_at' | 'paid_by' | 'deduct_from_driver_share' | 'expense_date'> & { id?: string; created_at?: string; paid_by?: string; deduct_from_driver_share?: boolean; expense_date?: string };
        Update: Partial<Omit<VehicleExpense, 'id'>>;
      };
      financial_transactions: {
        Row: FinancialTransaction;
        Insert: Omit<FinancialTransaction, 'id' | 'created_at' | 'payment_method_code' | 'transaction_date'> & { id?: string; created_at?: string; payment_method_code?: string; transaction_date?: string };
        Update: Partial<Omit<FinancialTransaction, 'id'>>;
      };
      whatsapp_sessions: {
        Row: WhatsappSession;
        Insert: Omit<WhatsappSession, 'id' | 'created_at' | 'session_status' | 'detected_intent' | 'missing_fields' | 'ai_confidence_score' | 'last_message_at'> & { id?: string; created_at?: string; session_status?: string; detected_intent?: string; missing_fields?: string[]; ai_confidence_score?: number; last_message_at?: string };
        Update: Partial<Omit<WhatsappSession, 'id'>>;
      };
      whatsapp_messages: {
        Row: WhatsappMessage;
        Insert: Omit<WhatsappMessage, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<WhatsappMessage, 'id'>>;
      };
      dialect_landmarks: {
        Row: DialectLandmark;
        Insert: Omit<DialectLandmark, 'id'> & { id?: string };
        Update: Partial<Omit<DialectLandmark, 'id'>>;
      };
      activity_logs: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, 'id' | 'created_at' | 'details'> & { id?: string; created_at?: string; details?: any };
        Update: Partial<Omit<ActivityLog, 'id'>>;
      };
    };
    Enums: {
      user_role: UserRole;
      driver_availability: DriverAvailability;
      order_source: OrderSource;
      order_status: OrderStatus;
      settlement_flow: SettlementFlow;
    };
  };
}
