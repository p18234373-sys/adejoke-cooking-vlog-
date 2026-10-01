CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  method TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL,
  payment TEXT NOT NULL DEFAULT 'Cash on delivery / pickup',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_admins (
  email TEXT PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);