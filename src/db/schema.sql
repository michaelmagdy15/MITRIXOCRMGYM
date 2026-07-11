-- CockroachDB Schema for Inzan Athletics (mitrixo cluster)

-- 1. Packages table
CREATE TABLE IF NOT EXISTS packages (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    sessions INT NOT NULL,
    expiry_days INT NOT NULL,
    branch VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    image_url TEXT
);

-- 2. Coaches table
CREATE TABLE IF NOT EXISTS coaches (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    user_id VARCHAR(50),
    phone VARCHAR(50)
);

-- 3. Clients table
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    member_id VARCHAR(50),
    gender VARCHAR(20),
    date_of_birth VARCHAR(50),
    sales_name VARCHAR(255),
    sales_rep VARCHAR(255),
    package_type VARCHAR(255),
    start_date VARCHAR(50),
    branch VARCHAR(100),
    sessions_remaining INT,
    assigned_to VARCHAR(50),
    created_at VARCHAR(50),
    national_id VARCHAR(50),
    email VARCHAR(255),
    backup_phone VARCHAR(50),
    is_blacklisted BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    advertising_source VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(100),
    address TEXT,
    home_phone VARCHAR(50),
    nationality VARCHAR(100),
    job_title VARCHAR(100),
    guest_serial VARCHAR(100),
    civilian_or_military VARCHAR(20),
    referred_by_name VARCHAR(255),
    linked_account BOOLEAN DEFAULT FALSE,
    linked_client_ids TEXT[],
    portal_user_id VARCHAR(50),
    packages JSONB,
    comments JSONB,
    interactions JSONB,
    import_batch_id VARCHAR(50),
    last_contact_date VARCHAR(50),
    personal_email VARCHAR(255),
    stage VARCHAR(50),
    interest VARCHAR(100),
    category VARCHAR(100),
    source VARCHAR(100),
    expected_visit_date VARCHAR(50),
    trial_date VARCHAR(50),
    membership_expiry VARCHAR(50),
    height NUMERIC(6, 2),
    weight NUMERIC(6, 2),
    activity_level VARCHAR(50),
    workout_times TEXT[],
    fitness_target VARCHAR(100),
    ai_tokens INT DEFAULT 0,
    referral_code VARCHAR(50),
    referred_by VARCHAR(50),
    emergency_contact_name VARCHAR(255),
    civil_status VARCHAR(50),
    barcode VARCHAR(100),
    card_id VARCHAR(100),
    legacy_notes TEXT,
    legacy_member_id VARCHAR(50)
);

-- Indexes for clients table to ensure instant lookup speeds
CREATE INDEX IF NOT EXISTS idx_clients_member_id ON clients(member_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- 4. Payments table
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) REFERENCES clients(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    amount NUMERIC(12, 2) NOT NULL,
    amount_paid NUMERIC(12, 2) NOT NULL,
    discount_value NUMERIC(12, 2) DEFAULT 0,
    method VARCHAR(50),
    notes TEXT,
    currency VARCHAR(20) DEFAULT 'L.E.',
    receipt_serial VARCHAR(100),
    sales_rep_id VARCHAR(50),
    package_type VARCHAR(255),
    package_category_type VARCHAR(100),
    created_at VARCHAR(50),
    deleted_at VARCHAR(50),
    date VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);

-- 5. Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(50) REFERENCES clients(id) ON DELETE CASCADE,
    branch VARCHAR(100) NOT NULL,
    date VARCHAR(50) NOT NULL,
    recorded_by VARCHAR(50),
    package_name VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_attendance_client_id ON attendance(client_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- 6. Sessions table (Private PT Sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) REFERENCES clients(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    coach_id VARCHAR(50),
    coach_name VARCHAR(255),
    date VARCHAR(50) NOT NULL,
    time VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    branch VARCHAR(100),
    created_at VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);

-- 7. Tasks table (Sales Tasks)
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL,
    due_date VARCHAR(50),
    assigned_to VARCHAR(50),
    assigned_name VARCHAR(255),
    client_id VARCHAR(50),
    client_name VARCHAR(255),
    created_by VARCHAR(50),
    created_at VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- 8. Import Batches table
CREATE TABLE IF NOT EXISTS import_batches (
    id VARCHAR(50) PRIMARY KEY,
    date VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    imported_count INT NOT NULL,
    failed_count INT NOT NULL,
    errors JSONB,
    status VARCHAR(50) NOT NULL
);

-- 9. User Targets table
CREATE TABLE IF NOT EXISTS user_targets (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    month VARCHAR(20) NOT NULL,
    year INT NOT NULL
);

-- 10. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    details TEXT NOT NULL,
    timestamp VARCHAR(50) NOT NULL,
    user_id VARCHAR(50),
    user_name VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
