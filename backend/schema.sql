CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('physical_book', 'digital_download')),
  price_minor integer NOT NULL CHECK (price_minor > 0),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT false,
  stock integer CHECK (stock IS NULL OR stock >= 0),
  payment_link_enabled boolean NOT NULL DEFAULT false,
  price_confirmed boolean NOT NULL DEFAULT false,
  fulfillment_ready boolean NOT NULL DEFAULT false,
  storage_key uuid,
  file_name text,
  file_content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  customer_email text NOT NULL,
  shipping_address jsonb,
  status text NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed')) DEFAULT 'created',
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled')),
  tracking_reference text,
  inventory_reserved boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  razorpay_order_id text UNIQUE,
  razorpay_payment_link_id text UNIQUE,
  checkout_method text NOT NULL DEFAULT 'standard' CHECK (checkout_method IN ('standard', 'payment_link')),
  razorpay_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_link_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_link_id text UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_method text NOT NULL DEFAULT 'standard' CHECK (checkout_method IN ('standard', 'payment_link'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_ready boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS storage_key uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS file_content_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Verified site-owned offer. It remains unavailable until shipping, tax, stock,
-- refund terms, and seller operations are confirmed by the merchant.
INSERT INTO products (slug, title, description, kind, price_minor, currency, active, stock, payment_link_enabled)
VALUES ('higher-mathematics', 'Higher Mathematics', 'Printed mathematics preparation book by Maharana Sibasankar. Current site listing: INR 756; shipping charges and delivery availability require confirmation.', 'physical_book', 75600, 'INR', false, NULL, false)
ON CONFLICT (slug) DO NOTHING;

-- Keep the listed book unavailable until a merchant has explicitly confirmed
-- both the full payable price and fulfilment readiness.
UPDATE products SET active = false, payment_link_enabled = false
WHERE slug = 'higher-mathematics' AND (price_confirmed = false OR fulfillment_ready = false);

CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  publisher text NOT NULL,
  url text NOT NULL UNIQUE CHECK (url ~ '^https://'),
  disclosure text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_url_unique_idx ON affiliates (url);

INSERT INTO affiliates (title, publisher, url, disclosure, active) VALUES
  ('Six Easy Pieces', 'Richard P. Feynman', 'https://www.amazon.in/s?k=Six+Easy+Pieces+Richard+Feynman&tag=aapkicareer21-21', 'Some links are affiliate links. As an Amazon Associate I earn from qualifying purchases.', true),
  ('Astrophysics for People in a Hurry', 'Neil deGrasse Tyson', 'https://www.amazon.in/s?k=Astrophysics+for+People+in+a+Hurry+Neil+deGrasse+Tyson&tag=aapkicareer21-21', 'Some links are affiliate links. As an Amazon Associate I earn from qualifying purchases.', true),
  ('Conceptual Physics', 'Paul G. Hewitt', 'https://www.amazon.in/s?k=Conceptual+Physics+Paul+G+Hewitt&tag=aapkicareer21-21', 'Some links are affiliate links. As an Amazon Associate I earn from qualifying purchases.', true)
ON CONFLICT (url) DO UPDATE SET title=EXCLUDED.title, publisher=EXCLUDED.publisher, disclosure=EXCLUDED.disclosure;

CREATE TABLE IF NOT EXISTS order_file_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  max_downloads integer NOT NULL CHECK (max_downloads BETWEEN 1 AND 100),
  download_count integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS orders_fulfillment_created_at_idx ON orders (fulfillment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_file_grants_order_id_idx ON order_file_grants (order_id, created_at DESC);

-- Add only verified products with confirmed prices. Products are not purchasable until active=true.
