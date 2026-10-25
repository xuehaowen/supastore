ALTER TABLE attributes ADD COLUMN kind text NOT NULL DEFAULT 'descriptive';
--> statement-breakpoint
ALTER TABLE attributes ADD CONSTRAINT attributes_kind_check CHECK (kind IN ('descriptive', 'variant'));
--> statement-breakpoint
-- Retain the identity of every existing variant option and its SKU combinations.
UPDATE attributes a SET kind = 'variant'
WHERE EXISTS (SELECT 1 FROM product_options p WHERE p.attribute_id = a.id)
   OR EXISTS (SELECT 1 FROM variant_attribute_values v WHERE v.attribute_id = a.id);
--> statement-breakpoint
-- A previously shared field gets a separate descriptive copy, preserving all
-- specification assignments and translations without changing variant identities.
DO $$
DECLARE a record; v record; descriptive_id uuid; value_id uuid;
BEGIN
  FOR a IN SELECT * FROM attributes WHERE kind = 'variant'
    AND id IN (SELECT attribute_id FROM product_specifications)
  LOOP
    descriptive_id := gen_random_uuid();
    INSERT INTO attributes (id, code, name, kind, sort_order, is_archived)
      VALUES (descriptive_id, 'desc-' || replace(descriptive_id::text, '-', ''), a.name, 'descriptive', a.sort_order, a.is_archived);
    INSERT INTO attribute_translations (attribute_id, locale, name)
      SELECT descriptive_id, locale, name FROM attribute_translations WHERE attribute_id = a.id;
    FOR v IN SELECT * FROM attribute_values WHERE attribute_id = a.id LOOP
      value_id := gen_random_uuid();
      INSERT INTO attribute_values (id, attribute_id, code, label, sort_order, is_archived)
        VALUES (value_id, descriptive_id, v.code, v.label, v.sort_order, v.is_archived);
      INSERT INTO attribute_value_translations (attribute_value_id, locale, label)
        SELECT value_id, locale, label FROM attribute_value_translations WHERE attribute_value_id = v.id;
      UPDATE product_specifications SET attribute_id = descriptive_id, attribute_value_id = value_id
        WHERE attribute_id = a.id AND attribute_value_id = v.id;
    END LOOP;
  END LOOP;
END $$;
