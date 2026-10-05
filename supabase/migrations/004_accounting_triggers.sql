-- 1. BEFORE UPDATE Trigger Function: fn_process_completed_order
CREATE OR REPLACE FUNCTION fn_process_completed_order()
RETURNS TRIGGER AS $$
DECLARE
    v_office_pct NUMERIC(5,2);
    v_driver_pct NUMERIC(5,2);
    v_vehicle_office_pct NUMERIC(5,2);
    v_vehicle_driver_pct NUMERIC(5,2);
    v_settlement_type settlement_flow;
BEGIN
    -- Only trigger when status changes to 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Ensure final fare is set (default to calculated + extra if 0 or null)
        IF NEW.final_fare IS NULL OR NEW.final_fare = 0 THEN
            NEW.final_fare := COALESCE(NEW.calculated_fare, 0) + COALESCE(NEW.extra_charges, 0);
        END IF;

        -- DETERMINE COMMISSION SPLIT PERCENTAGE (Requirement 10 & 11)
        
        -- Priority 1: Driver custom override
        SELECT custom_office_pct_override INTO v_office_pct
        FROM drivers WHERE id = NEW.assigned_driver_id;
        
        IF v_office_pct IS NOT NULL THEN
            v_driver_pct := 100.00 - v_office_pct;
        ELSE
            -- Priority 2: Vehicle custom override
            IF NEW.assigned_vehicle_id IS NOT NULL THEN
                SELECT custom_company_pct, custom_driver_pct 
                INTO v_vehicle_office_pct, v_vehicle_driver_pct 
                FROM vehicles WHERE id = NEW.assigned_vehicle_id;
                
                IF v_vehicle_office_pct IS NOT NULL THEN
                    v_office_pct := v_vehicle_office_pct;
                    v_driver_pct := COALESCE(v_vehicle_driver_pct, 100.00 - v_vehicle_office_pct);
                END IF;
            END IF;

            -- Priority 3: Driver Category default
            IF v_office_pct IS NULL THEN
                SELECT dc.default_office_commission_pct, dc.default_driver_commission_pct 
                INTO v_office_pct, v_driver_pct
                FROM drivers d
                JOIN driver_categories dc ON d.category_id = dc.id
                WHERE d.id = NEW.assigned_driver_id;
            END IF;
        END IF;

        -- Safety fallback if all lookups failed
        IF v_office_pct IS NULL THEN
            v_office_pct := 0;
            v_driver_pct := 100;
        END IF;

        -- CALCULATE SHARE AMOUNTS
        NEW.applied_office_pct := v_office_pct;
        NEW.applied_driver_pct := v_driver_pct;
        NEW.office_share_amount := ROUND((NEW.final_fare * v_office_pct) / 100.0, 2);
        NEW.driver_share_amount := ROUND(NEW.final_fare - NEW.office_share_amount, 2);

        -- CALCULATE CASH VS CREDIT SETTLEMENT IMPACT (Requirement 6, 9, 14)
        SELECT settlement_type INTO v_settlement_type 
        FROM payment_methods WHERE code = NEW.payment_method_code;

        IF v_settlement_type = 'driver_collects_cash' THEN
            -- Driver collected the cash from passenger, owes office its commission
            NEW.driver_net_balance_impact := NEW.office_share_amount;
        ELSIF v_settlement_type = 'office_receives_digital_or_credit' THEN
            -- Office got the money digitally, owes driver their commission
            NEW.driver_net_balance_impact := -1 * NEW.driver_share_amount;
        END IF;

        -- Set completion timestamp
        NEW.completed_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_process_completed_order
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION fn_process_completed_order();


-- 2. AFTER UPDATE Trigger Function: fn_post_order_completion
CREATE OR REPLACE FUNCTION fn_post_order_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Set the assigned driver's availability = 'available'
        IF NEW.assigned_driver_id IS NOT NULL THEN
            UPDATE drivers SET availability = 'available' WHERE id = NEW.assigned_driver_id;
        END IF;

        -- Upsert/Update the customer in customers table
        INSERT INTO customers (phone, full_name, default_pickup_address, total_trips, total_spend, last_order_at)
        VALUES (NEW.customer_phone, NEW.customer_name, NEW.pickup_address, 1, NEW.final_fare, now())
        ON CONFLICT (phone) DO UPDATE 
        SET 
            total_trips = customers.total_trips + 1,
            total_spend = customers.total_spend + NEW.final_fare,
            last_order_at = now(),
            -- Only update default address if it is currently blank/null
            default_pickup_address = COALESCE(NULLIF(customers.default_pickup_address, ''), NEW.pickup_address);

        -- Update the customer_id on the order if it wasn't set, based on the phone we just upserted
        -- Note: Doing this cleanly without infinite loop because we are in AFTER UPDATE. 
        -- An async function or manual update might be better, but since customer is upserted, 
        -- we just leave the order as is for now, or you'd typically handle order's customer_id before insertion.

        -- Insert an entry into activity_logs
        INSERT INTO activity_logs (actor_name, entity_type, entity_id, action, details)
        VALUES (
            'system', 
            'order', 
            NEW.id, 
            'order_completed', 
            jsonb_build_object(
                'final_fare', NEW.final_fare, 
                'driver_impact', NEW.driver_net_balance_impact,
                'payment_method', NEW.payment_method_code,
                'office_share', NEW.office_share_amount
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_post_order_completion
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION fn_post_order_completion();
