CREATE TABLE IF NOT EXISTS public.octogenarian_benefit_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ncsc_registration_reference_number VARCHAR(100),
    osca_id_number VARCHAR(100),
    benefit_type VARCHAR(20) NOT NULL CHECK (benefit_type IN ('Octogenarian', 'Nonagenarian', 'Centenarian')),
    date_of_birth DATE NOT NULL,
    date_of_application DATE NOT NULL DEFAULT CURRENT_DATE,
    residential_address TEXT,
    permanent_address_philippines TEXT,
    spouse_name VARCHAR(255),
    spouse_citizenship VARCHAR(100),
    representative_name VARCHAR(255),
    representative_relationship VARCHAR(100),
    contact_number VARCHAR(50),
    email_address VARCHAR(255),
    citizenship VARCHAR(100),
    is_dual_citizen BOOLEAN DEFAULT FALSE,
    dual_citizenship_details TEXT,
    birth_certificate_submitted BOOLEAN DEFAULT FALSE,
    valid_id_submitted BOOLEAN DEFAULT FALSE,
    id_picture_submitted BOOLEAN DEFAULT FALSE,
    full_body_picture_submitted BOOLEAN DEFAULT FALSE,
    endorsed_list_submitted BOOLEAN DEFAULT FALSE,
    documentary_requirements_complete BOOLEAN DEFAULT FALSE,
    validation_status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (validation_status IN ('Pending', 'Under Review', 'Eligible', 'Ineligible', 'Approved', 'Rejected')),
    findings_concerns_recommendations TEXT,
    validated_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    date_validated DATE,
    applicant_signature TEXT,
    applicant_signature_date DATE,
    benefit_amount NUMERIC(12,2),
    benefit_status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (benefit_status IN ('Pending', 'For Processing', 'Approved', 'Released', 'Cancelled')),
    date_released DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_octogenarian_benefit_applications_user_id
    ON public.octogenarian_benefit_applications (user_id);

ALTER TABLE public.octogenarian_benefit_applications DISABLE ROW LEVEL SECURITY;
