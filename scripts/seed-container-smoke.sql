INSERT INTO store_settings(store_name,support_email,setup_completed,is_bootstrap_completed,email_verified_at)
VALUES('Generic smoke store','support@example.test',true,true,now());
INSERT INTO shipping_zones(name,rate_cents) VALUES('Worldwide',0);
INSERT INTO payment_accounts(account_name,account_type,account_identifier) VALUES('Manual fixture','other','Fixture instructions');
WITH product AS (
  INSERT INTO products(title,handle,is_published) VALUES('Fixture product','fixture-product',true) RETURNING id
)
INSERT INTO product_variants(product_id,sku,title,price_cents,is_available)
SELECT id,'fixture-sku','Default',1000,true FROM product;
