-- ============================================================
-- CampusRun Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ──────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('customer', 'runner', 'admin');

CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'awaiting_runner',
  'runner_assigned',
  'preparing',
  'picked_up',
  'delivered',
  'cancelled',
  'needs_attention'
);

CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed');
CREATE TYPE payment_channel AS ENUM ('transfer', 'ussd', 'card');

-- ── TABLES ─────────────────────────────────────────────────

CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           TEXT UNIQUE NOT NULL,
  email           TEXT,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'customer',
  matric_number   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE restaurants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  location        TEXT NOT NULL,
  image_url       TEXT,
  emoji           TEXT NOT NULL DEFAULT '🍽️',
  is_open         BOOLEAN NOT NULL DEFAULT true,
  avg_prep_time   INT NOT NULL DEFAULT 15, -- minutes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price           INT NOT NULL, -- Naira
  image_url       TEXT,
  category        TEXT NOT NULL DEFAULT 'Main',
  is_available    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_ref       TEXT NOT NULL UNIQUE,
  customer_id     UUID NOT NULL REFERENCES users(id),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
  runner_id       UUID REFERENCES users(id),
  items           JSONB NOT NULL, -- [{menu_item_id, name, qty, price}]
  delivery_address TEXT NOT NULL,
  food_total      INT NOT NULL,
  delivery_fee    INT NOT NULL DEFAULT 500,
  platform_cut    INT NOT NULL DEFAULT 200,
  runner_earnings INT NOT NULL DEFAULT 300,
  status          order_status NOT NULL DEFAULT 'pending',
  broadcast_at    TIMESTAMPTZ,
  broadcast_count INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ
);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  paystack_ref    TEXT NOT NULL UNIQUE,
  amount          INT NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',
  channel         payment_channel NOT NULL DEFAULT 'transfer',
  paid_at         TIMESTAMPTZ
);

CREATE TABLE runner_profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_available    BOOLEAN NOT NULL DEFAULT false,
  total_deliveries INT NOT NULL DEFAULT 0,
  total_earnings  INT NOT NULL DEFAULT 0,
  bank_name       TEXT,
  account_number  TEXT,
  rating          FLOAT NOT NULL DEFAULT 5.0
);

-- ── INDEXES ────────────────────────────────────────────────

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_runner ON orders(runner_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_broadcast ON orders(broadcast_at) WHERE status = 'awaiting_runner';
CREATE INDEX idx_menu_restaurant ON menu_items(restaurant_id);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE runner_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Restaurants are readable by everyone
CREATE POLICY "restaurants_public_read" ON restaurants FOR SELECT USING (true);

-- Menu items readable by everyone
CREATE POLICY "menu_items_public_read" ON menu_items FOR SELECT USING (true);

-- Orders: customers see their own, runners see assigned + awaiting
CREATE POLICY "orders_customer_read" ON orders FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "orders_runner_read" ON orders FOR SELECT
  USING (
    auth.uid() = runner_id
    OR status IN ('awaiting_runner', 'confirmed')
  );

CREATE POLICY "orders_customer_insert" ON orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Runners can update status of their assigned orders
CREATE POLICY "orders_runner_update" ON orders FOR UPDATE
  USING (
    auth.uid() = runner_id
    OR (runner_id IS NULL AND status IN ('awaiting_runner', 'confirmed'))
  );

-- Runner profiles
CREATE POLICY "runner_profile_read_own" ON runner_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "runner_profile_update_own" ON runner_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Payments: users see their own order's payments
CREATE POLICY "payments_read_own" ON payments FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
  );

-- ── FUNCTIONS ──────────────────────────────────────────────

-- Auto-update runner earnings on delivery
CREATE OR REPLACE FUNCTION update_runner_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.runner_id IS NOT NULL THEN
    UPDATE runner_profiles
    SET
      total_deliveries = total_deliveries + 1,
      total_earnings = total_earnings + NEW.runner_earnings
    WHERE user_id = NEW.runner_id;

    NEW.delivered_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_delivered
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_runner_on_delivery();

-- ── SEED DATA ──────────────────────────────────────────────

-- Sample restaurants (update with your real data)
INSERT INTO restaurants (name, location, emoji, is_open, avg_prep_time) VALUES
  ('Mama Tee''s Kitchen', 'Near Block A, Main Campus', '🍛', true, 15),
  ('Fresh Bites', 'Student Union Building', '🥗', true, 10),
  ('Chichi''s Grill', 'Near Faculty of Science', '🍗', true, 20),
  ('Campus Buka', 'Old Campus Entrance', '🍲', true, 12);

-- Sample menu items for Mama Tee's
INSERT INTO menu_items (restaurant_id, name, description, price, category)
SELECT
  id,
  name, description, price, category
FROM (VALUES
  ('Jollof Rice + Chicken', 'Party-style with fried plantain', 1800, 'Rice'),
  ('Fried Rice + Fish', 'Served with coleslaw', 2000, 'Rice'),
  ('Egusi Soup + Eba', 'With assorted meat', 1500, 'Swallow'),
  ('Ofe Onugbu + Fufu', 'Bitter leaf soup, rich and thick', 1500, 'Swallow'),
  ('Moi Moi', 'Steamed bean pudding', 500, 'Snacks'),
  ('Zobo Drink', 'Chilled hibiscus drink', 300, 'Drinks'),
  ('Water (50cl)', 'Pure water bottle', 200, 'Drinks')
) AS t(name, description, price, category)
CROSS JOIN (SELECT id FROM restaurants WHERE name = 'Mama Tee''s Kitchen') r;
