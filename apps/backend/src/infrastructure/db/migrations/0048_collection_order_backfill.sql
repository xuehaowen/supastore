-- Retain the previous alphabetical order until an owner chooses positions.
WITH positions AS (
  SELECT id, row_number() OVER (ORDER BY title, id)::integer AS position
  FROM product_collections
)
UPDATE product_collections c SET sort_order = p.position
FROM positions p WHERE p.id = c.id;
