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
    date VARCHAR(50),
    recorded_by VARCHAR(50),
    recorded_by_name VARCHAR(255)
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
    pt_target NUMERIC(12, 2) DEFAULT 0,
    classes_target NUMERIC(12, 2) DEFAULT 0,
    memberships_target NUMERIC(12, 2) DEFAULT 0,
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
-- 11. Call Center Logs table
CREATE TABLE IF NOT EXISTS club_operations (
    id VARCHAR(50) PRIMARY KEY,
    entity_id VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255)
);

-- 16. Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    branch JSONB,
    sales_target NUMERIC(12,2),
    can_delete_payments BOOLEAN,
    can_view_global_dashboard BOOLEAN,
    can_access_settings_and_history BOOLEAN,
    can_delete_records BOOLEAN,
    can_assign_leads BOOLEAN,
    last_seen TIMESTAMP,
    is_pending BOOLEAN,
    coach_id VARCHAR(50),
    client_record_id VARCHAR(100),
    client_doc_id VARCHAR(100),
    phone VARCHAR(50),
    must_change_password BOOLEAN,
    photo_url TEXT,
    dismissed_notifications JSONB,
    status VARCHAR(50)
);

-- 17. Settings table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS call_center_logs (
    id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    member_phone VARCHAR(50) NOT NULL,
    member_status VARCHAR(50) NOT NULL,
    package_data TEXT,
    call_type VARCHAR(50) NOT NULL,
    comment TEXT,
    source VARCHAR(100),
    created_by VARCHAR(50),
    created_by_name VARCHAR(255),
    created_at VARCHAR(50) NOT NULL,
    branch VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_call_logs_member_id ON call_center_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_center_logs(created_at DESC);

-- 12. Complaints table
CREATE TABLE IF NOT EXISTS complaints (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id VARCHAR(50),
    category_name VARCHAR(100),
    category VARCHAR(100),
    priority VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    member_id VARCHAR(50),
    member_name VARCHAR(255),
    branch VARCHAR(100),
    resolution_notes TEXT,
    resolved_at VARCHAR(50),
    resolved_by VARCHAR(50),
    created_by VARCHAR(50),
    created_by_name VARCHAR(255),
    created_at VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_complaints_member_id ON complaints(member_id);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- 13. Lost and Found table
CREATE TABLE IF NOT EXISTS lost_and_found (
    id VARCHAR(50) PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(50),
    category_name VARCHAR(100),
    category VARCHAR(100),
    found_date VARCHAR(50) NOT NULL,
    found_by VARCHAR(255),
    branch VARCHAR(100) NOT NULL,
    photo_url TEXT,
    status VARCHAR(50) NOT NULL,
    claimed_by VARCHAR(50),
    claimed_by_name VARCHAR(255),
    claimed_date VARCHAR(50),
    disposed_date VARCHAR(50),
    created_by VARCHAR(50),
    created_at VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lost_found_status ON lost_and_found(status);
CREATE INDEX IF NOT EXISTS idx_lost_found_found_date ON lost_and_found(found_date DESC);

-- 14. Calendar Events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time VARCHAR(50) NOT NULL,
    end_time VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    branch VARCHAR(100),
    created_by VARCHAR(50),
    created_at VARCHAR(50) NOT NULL,
    coach_name VARCHAR(255),
    capacity INT DEFAULT 15,
    attendees JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- 15. Bookings table
CREATE TABLE IF NOT EXISTS booking_requests (
    id VARCHAR(50) PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    client_email VARCHAR(255),
    client_id VARCHAR(50),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    instapay_ref VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    created_at VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_req_status ON booking_requests(status);

-- 16. Club Operations table
CREATE TABLE IF NOT EXISTS club_operations (
    id VARCHAR(50) PRIMARY KEY,
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    assigned_to VARCHAR(50),
    assigned_to_name VARCHAR(255),
    due_date VARCHAR(50),
    completed_at VARCHAR(50),
    completed_by VARCHAR(50),
    branch VARCHAR(100),
    created_by VARCHAR(50),
    created_at VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_club_operations_status ON club_operations(status);
CREATE INDEX IF NOT EXISTS idx_club_operations_due_date ON club_operations(due_date);

