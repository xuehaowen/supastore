import postgres from "postgres";
import { assertFixtureTarget } from "./fixture-target";
import { fixtureProfile } from "./protocol";
import { benchmarkImages } from "./images.mjs";
import { computeCrockfordChecksum } from "../../apps/backend/src/domain/money/reference-code";
import {
  buildVariantCombinations,
  type GenerationOption,
} from "../../apps/backend/src/domain/catalog/variant-combinations";

/** Only the owning harness creates/migrates the database and ownership marker. */
export async function seedRepresentativeFixture(
  connection: string,
  token: string,
  requested: ReturnType<typeof fixtureProfile>,
) {
  const database = assertFixtureTarget(connection, token);
  const profile = fixtureProfile(
    requested.products,
    requested.fulfillment,
    requested.rewards,
    requested.trackedStock,
  );
  const client = postgres(connection, { max: 1, onnotice: () => {} });
  try {
    return await client.begin(async (tx) => {
      const [identity] =
        await tx`select current_database() as name, host(inet_server_addr()) as host, inet_server_port()::text as port`;
      if (
        identity?.name !== database ||
        identity.host !== "127.0.0.1" ||
        identity.port !== new URL(connection).port
      )
        throw new Error("Benchmark fixture ownership mismatch");
      const owners =
        await tx`select token::text from benchmark_fixture_ownership for update`;
      if (owners.length !== 1 || owners[0]!.token !== token)
        throw new Error("Benchmark fixture ownership mismatch");
      const [existing] =
        await tx`select (select count(*) from products) + (select count(*) from orders) + (select count(*) from store_settings) as n`;
      if (Number(existing!.n) !== 0)
        throw new Error("Benchmark fixture must be empty");

      // Namespaced v4-shaped deterministic IDs. Temporary helpers never enter app schema.
      await tx`create temporary table benchmark_anchor(n int) on commit drop`;
      await tx.unsafe(`create function pg_temp.bench_id(kind text,n int) returns uuid language sql immutable as $$
        select overlay(overlay(md5('20261016:'||kind||':'||n::text) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid
      $$`);
      await tx`insert into store_settings(store_name,support_email,setup_completed,is_bootstrap_completed,email_verified_at,commerce_policy,created_at,updated_at)
        values('Synthetic benchmark store','support@example.test',true,true,'2025-12-01',
          ${tx.json({ guestCheckout: true, rewardsEnabled: profile.rewards, rewardRateBasisPoints: 500, rewardEligibleCategoryIds: [], rewardsStartAt: null, rewardsEndAt: null, shippingEnabled: profile.fulfillment !== "pickup", pickupEnabled: profile.fulfillment !== "shipping", deliveryEnabled: false, salesThresholdCents: null, fiscalYearStartMonth: 1 })}::jsonb,'2025-12-01','2025-12-01')`;
      await tx`insert into payment_accounts(id,account_name,account_identifier,account_type)
        values(pg_temp.bench_id('bank',1),'Synthetic bank','Synthetic transfer instructions','other')`;
      if (profile.fulfillment !== "pickup")
        await tx`insert into shipping_zones(id,name,rate_cents,country_codes) values(pg_temp.bench_id('zone',1),'Synthetic shipping',0,'["US"]'::jsonb)`;
      if (profile.fulfillment !== "shipping")
        await tx`insert into pickup_location(id,name,address,weekly_schedule,prep_minutes,schedule_required)
          values(pg_temp.bench_id('location',1),'Synthetic pickup','1 Fixture Street','{}'::jsonb,0,false)`;
      await tx`insert into categories(id,slug,name,sort_order,created_at,updated_at)
        select pg_temp.bench_id('category',n),'benchmark-category-'||n,'Category '||n,n,'2025-12-01','2025-12-01' from generate_series(1,8) n`;
      await tx`insert into attributes(id,code,name,sort_order) values
        (pg_temp.bench_id('attribute',1),'benchmark-size','Size',1),
        (pg_temp.bench_id('attribute',2),'benchmark-flavor','Flavor',2)`;
      await tx`insert into attribute_values(id,attribute_id,code,label,sort_order)
        select pg_temp.bench_id('value',n), pg_temp.bench_id('attribute',case when n<=2 then 1 else 2 end),
          case n when 1 then 'small' when 2 then 'large' when 3 then 'plain' else 'cocoa' end,
          case n when 1 then 'Small' when 2 then 'Large' when 3 then 'Plain' else 'Cocoa' end,n
        from generate_series(1,4) n`;
      const optionRows = await tx<
        { option: GenerationOption }[]
      >`select jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'values',
        (select jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'label',v.label) order by v.sort_order) from attribute_values v where v.attribute_id=a.id)
      ) as option from attributes a order by a.sort_order`;
      const combinationKeys = buildVariantCombinations(
        optionRows.map((row) => row.option),
        "BENCH",
      ).map((combination) => combination.key);
      await tx`insert into products(id,handle,title,description,created_at,updated_at)
        select pg_temp.bench_id('product',n),'benchmark-product-'||n,'Bakery loaf '||n,
          repeat('Synthetic baked goods catalog description with ingredients, storage and collection instructions. ',5),
          '2025-12-01','2025-12-01' from generate_series(1,${profile.products}::int) n`;
      await tx`insert into product_categories(product_id,category_id)
        select pg_temp.bench_id('product',n),pg_temp.bench_id('category',1+(n-1)%8) from generate_series(1,${profile.products}::int) n`;
      await tx`insert into product_options(id,product_id,attribute_id,sort_order)
        select pg_temp.bench_id('option',(n-1)*2+a),pg_temp.bench_id('product',n),pg_temp.bench_id('attribute',a),a
        from generate_series(1,${profile.products}::int) n cross join generate_series(1,2) a`;
      await tx`insert into product_option_values(option_id,attribute_id,attribute_value_id)
        select pg_temp.bench_id('option',(n-1)*2+a),pg_temp.bench_id('attribute',a),pg_temp.bench_id('value',(a-1)*2+v)
        from generate_series(1,${profile.products}::int) n cross join generate_series(1,2) a cross join generate_series(1,2) v`;
      await tx`insert into product_variants(id,product_id,sku,title,price_cents,attributes,combination_key,sort_order,created_at,updated_at)
        select pg_temp.bench_id('variant',(n-1)*4+v),pg_temp.bench_id('product',n),'BENCH-'||n||'-'||v,
          (case when v<=2 then 'Small' else 'Large' end)||' / '||(case when v%2=1 then 'Plain' else 'Cocoa' end),
          800+(n%50)*25+v*100,
          jsonb_build_object('benchmark-size',case when v<=2 then 'small' else 'large' end,'benchmark-flavor',case when v%2=1 then 'plain' else 'cocoa' end),
          (${combinationKeys}::text[])[v],v,
          '2025-12-01','2025-12-01'
        from generate_series(1,${profile.products}::int) n cross join generate_series(1,4) v`;
      await tx`insert into variant_attribute_values(variant_id,attribute_id,attribute_value_id)
        select pg_temp.bench_id('variant',(n-1)*4+v),pg_temp.bench_id('attribute',a),
          pg_temp.bench_id('value',case when a=1 then (case when v<=2 then 1 else 2 end) else 3+(v-1)%2 end)
        from generate_series(1,${profile.products}::int) n cross join generate_series(1,4) v cross join generate_series(1,2) a`;
      await tx`insert into product_images(id,product_id,s3_key,alt_text,sort_order,created_at)
        select pg_temp.bench_id('image',(n-1)*2+i),pg_temp.bench_id('product',n),
          'catalog/'||pg_temp.bench_id('product',n)||'/b3000000-0000-4000-8000-00000000000'||i||'.png',
          'Synthetic benchmark texture '||i,i-1,'2025-12-01'
        from generate_series(1,${profile.products}::int) n cross join generate_series(1,2) i`;

      // Bulk fixture history, not measured checkout throughput. No outbox/provider calls.
      await tx`create temporary table benchmark_history on commit drop as
        select n,pg_temp.bench_id('variant',1+(n-1)%${profile.variants}::int) as variant_id,
          1+n%3 as quantity,n%5<>0 as completed,
          case when ${profile.fulfillment}='pickup' or (${profile.fulfillment}='mixed' and n%2=0) then 'pickup' else 'shipping' end as fulfillment,
          '2026-01-01'::timestamptz+n*interval '15 minutes' as created
        from generate_series(1,${profile.historicalOrders}::int) n`;
      // Checksummed references use the real domain algorithm, deterministically.
      const references = Array.from(
        { length: profile.historicalOrders },
        (_, index) => {
          const body = String(index + 1).padStart(8, "0");
          return {
            n: index + 1,
            code: `SP-${body.slice(0, 4)}-${body.slice(4)}${computeCrockfordChecksum(body)}`,
          };
        },
      );
      await tx`create temporary table benchmark_references(n int primary key,code text) on commit drop`;
      await tx`insert into benchmark_references ${tx(references, "n", "code")}`;
      await tx`insert into carts(id,guest_session_id,revision,created_at,updated_at)
        select pg_temp.bench_id('cart',n),'benchmark-history-'||n,1,created,created from benchmark_history`;
      await tx`insert into cart_items(id,cart_id,variant_id,quantity,created_at,updated_at)
        select pg_temp.bench_id('cart-item',n),pg_temp.bench_id('cart',n),variant_id,quantity,created,created from benchmark_history`;
      await tx`insert into quotes(id,cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,terms_snapshot,expires_at,created_at)
        select pg_temp.bench_id('quote',h.n),pg_temp.bench_id('cart',h.n),1,v.price_cents*h.quantity,0,0,0,v.price_cents*h.quantity,
          jsonb_build_array(jsonb_build_object('variantId',v.id,'title',v.title,'sku',v.sku,'quantity',h.quantity,'unitPriceCents',v.price_cents,'discountCents',0,'options',v.attributes)),
          jsonb_build_object('amountCents',0,'taxCents',0,'isTaxInclusive',false),
          jsonb_build_object('settingsVersion',1,'currency','USD','precision',2,'fulfillmentType',h.fulfillment,
            'shippingAddress',jsonb_build_object('country','US','address','1 Fixture Street'),
            'pickup',case when h.fulfillment='pickup' then jsonb_build_object('locationId',pg_temp.bench_id('location',1),'address','1 Fixture Street','date','','startTime','','endTime','') else null end,
            'delivery',null,'promotion',null,
            'payment',jsonb_build_object('id',pg_temp.bench_id('bank',1),'name','Synthetic bank','instructions','Synthetic transfer instructions'),
            'onlinePayment',false,'rewardProgramActive',${profile.rewards},
            'input',jsonb_build_object('fulfillmentType',h.fulfillment,'shippingAddress',jsonb_build_object('country','US','address','1 Fixture Street'),
              'pickupDate','','pickupLocationId',case when h.fulfillment='pickup' then pg_temp.bench_id('location',1)::text else '' end,
              'pickupTime','','paymentAccountId',pg_temp.bench_id('bank',1),'promotionCode','','deliveryAreaId','')),
          h.created+interval '15 minutes',h.created
        from benchmark_history h join product_variants v on v.id=h.variant_id`;
      await tx`insert into orders(id,source_cart_id,reference_code,quote_id,lifecycle_status,purchase_total_cents,guest_email,guest_name,fulfillment_type,shipping_address_snapshot,terms_snapshot,created_at,updated_at)
        select pg_temp.bench_id('order',h.n),q.cart_id,r.code,q.id,case when h.completed then 'completed' else 'cancelled' end,q.total_payable_cents,
          'history-'||h.n||'@example.test','Synthetic buyer '||h.n,h.fulfillment,q.terms_snapshot->'shippingAddress',q.terms_snapshot,h.created,h.created+interval '1 hour'
        from benchmark_history h join quotes q on q.id=pg_temp.bench_id('quote',h.n) join benchmark_references r on r.n=h.n`;
      await tx`update carts c set converted_order_id=o.id from orders o where o.source_cart_id=c.id`;
      await tx`insert into order_items(id,order_id,variant_id,quantity,unit_price_cents,line_total_cents,catalog_snapshot,created_at)
        select pg_temp.bench_id('order-item',h.n),pg_temp.bench_id('order',h.n),v.id,h.quantity,v.price_cents,v.price_cents*h.quantity,
          jsonb_build_object('title',p.title,'sku',v.sku,'options',v.attributes),h.created
        from benchmark_history h join product_variants v on v.id=h.variant_id join products p on p.id=v.product_id`;
      await tx`insert into payment_receipts(id,order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id,created_at,updated_at)
        select pg_temp.bench_id('receipt',h.n),o.id,pg_temp.bench_id('bank',1),o.purchase_total_cents,'BENCH'||h.n,'BENCH'||h.n,'benchmark-owner',h.created,h.created
        from benchmark_history h join orders o on o.id=pg_temp.bench_id('order',h.n) where h.completed`;
      await tx`insert into confirmation_funding(id,order_id,receipt_id,funded_amount_cents,created_at)
        select pg_temp.bench_id('funding',h.n),o.id,pg_temp.bench_id('receipt',h.n),o.purchase_total_cents,h.created
        from benchmark_history h join orders o on o.id=pg_temp.bench_id('order',h.n) where h.completed`;
      await tx`insert into order_fulfillments(id,order_id,status,carrier,tracking_number,handoff_actor,handoff_at,fulfilled_at,created_at,updated_at)
        select pg_temp.bench_id('fulfillment',n),pg_temp.bench_id('order',n),case when completed then 'fulfilled' else 'unfulfilled' end,
          case when completed and fulfillment='shipping' then 'Synthetic carrier' end,
          case when completed and fulfillment='shipping' then 'BENCH'||n end,
          case when completed and fulfillment='pickup' then 'benchmark-owner' end,
          case when completed and fulfillment='pickup' then created+interval '1 hour' end,
          case when completed then created+interval '1 hour' end,created,created+interval '1 hour' from benchmark_history`;
      await tx`insert into order_shipments(id,order_id,request_key,carrier,tracking_number,status,delivered_at,created_at)
        select pg_temp.bench_id('shipment',n),pg_temp.bench_id('order',n),'benchmark-dispatch','Synthetic carrier','BENCH'||n,'delivered',created+interval '1 hour',created
        from benchmark_history where completed and fulfillment='shipping'`;
      await tx`insert into shipment_items(shipment_id,order_item_id,quantity)
        select pg_temp.bench_id('shipment',n),pg_temp.bench_id('order-item',n),quantity from benchmark_history where completed and fulfillment='shipping'`;
      await tx`insert into variant_stock(variant_id,tracking_enabled,on_hand,reserved)
        select id,${profile.trackedStock},case when ${profile.trackedStock} then 1000000 else 0 end,0 from product_variants`;
      if (profile.trackedStock) {
        await tx`insert into stock_movements(id,variant_id,delta,reason,actor_id,request_key,created_at)
          select pg_temp.bench_id('initial-stock',n),pg_temp.bench_id('variant',n),1000000,'adjustment','benchmark-owner','benchmark-initial','2025-12-01'
          from generate_series(1,${profile.variants}::int) n`;
        await tx`insert into stock_reservations(id,order_id,order_item_id,variant_id,quantity,consumed_quantity,status,created_at)
          select pg_temp.bench_id('reservation',n),pg_temp.bench_id('order',n),pg_temp.bench_id('order-item',n),variant_id,quantity,
            case when completed then quantity else 0 end,case when completed then 'consumed' else 'released' end,created from benchmark_history`;
        await tx`insert into stock_movements(id,variant_id,order_id,delta,reason,actor_id,request_key,created_at)
          select pg_temp.bench_id('sale-stock',n),variant_id,pg_temp.bench_id('order',n),-quantity,'dispatch','benchmark-owner','benchmark-history-'||n,created+interval '1 hour'
          from benchmark_history where completed`;
        await tx`update variant_stock s set on_hand=on_hand-h.quantity from
          (select variant_id,sum(quantity)::int as quantity from benchmark_history where completed group by variant_id) h where h.variant_id=s.variant_id`;
      }
      await tx`analyze`;
      const [counts] = await tx`select
        (select count(*)::int from products) as products,(select count(*)::int from product_variants) as variants,
        (select count(*)::int from product_images) as images,(select count(*)::int from orders) as orders,
        (select count(*)::int from categories) as categories,(select count(*)::int from attributes) as attributes`;
      return {
        profile,
        counts,
        images: benchmarkImages.map(({ bytes, ...metadata }) => ({
          ...metadata,
          bytes: bytes.length,
        })),
        history: {
          completed: 8000,
          cancelled: 2000,
          customerType: "guest",
          generation: "bulk synthetic ledger, not checkout throughput",
        },
      };
    });
  } finally {
    await client.end();
  }
}
