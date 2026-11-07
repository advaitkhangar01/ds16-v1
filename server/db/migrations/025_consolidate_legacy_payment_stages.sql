-- 025_consolidate_legacy_payment_stages.sql
-- Consolidate legacy 'Adhar Card' and 'Pan Card' tags into 'Adhar Card & Pan Card'

DO $$
DECLARE
    r RECORD;
    existing_id INTEGER;
BEGIN
    -- 1. In project_payment_stages
    FOR r IN 
        SELECT id, project_id, document_type, amount, status
        FROM project_payment_stages
        WHERE document_type IN ('Adhar Card', 'Pan Card')
        ORDER BY project_id, id
    LOOP
        -- Check if an 'Adhar Card & Pan Card' record already exists for this project
        SELECT id INTO existing_id
        FROM project_payment_stages
        WHERE project_id = r.project_id AND document_type = 'Adhar Card & Pan Card'
        LIMIT 1;

        IF existing_id IS NOT NULL THEN
            IF r.status = 'payment initiated' THEN
                IF r.amount > 0 THEN
                    UPDATE project_payment_stages
                    SET amount = amount + r.amount, updated_at = NOW()
                    WHERE id = existing_id AND status = 'payment initiated';
                END IF;
                DELETE FROM project_payment_stages WHERE id = r.id;
            ELSE
                UPDATE project_payment_stages
                SET document_type = 'Adhar Card & Pan Card', updated_at = NOW()
                WHERE id = r.id;
            END IF;
        ELSE
            UPDATE project_payment_stages
            SET document_type = 'Adhar Card & Pan Card', updated_at = NOW()
            WHERE id = r.id;
        END IF;
    END LOOP;

    -- 2. In project_document_amounts
    FOR r IN
        SELECT project_id, amount
        FROM project_document_amounts
        WHERE document_type IN ('Adhar Card', 'Pan Card')
        ORDER BY project_id, (amount IS NOT NULL AND amount > 0) DESC
    LOOP
        INSERT INTO project_document_amounts (project_id, document_type, amount)
        VALUES (r.project_id, 'Adhar Card & Pan Card', r.amount)
        ON CONFLICT (project_id, document_type)
        DO UPDATE SET amount = COALESCE(project_document_amounts.amount, EXCLUDED.amount);
        
        DELETE FROM project_document_amounts
        WHERE project_id = r.project_id AND document_type IN ('Adhar Card', 'Pan Card');
    END LOOP;

    -- 3. In documents table
    UPDATE documents
    SET document_type = 'Adhar Card & Pan Card'
    WHERE document_type IN ('Adhar Card', 'Pan Card');

END $$;
