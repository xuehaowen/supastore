import { togglePause } from "@/app/actions";
import { OperationsSummary } from "@/app/admin/operations-summary";
import { Field, Hidden } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { money } from "@/infrastructure/web";
import type { OperationsScreenProps } from "./operations-types";
import { QueuePagination } from "./queue-pagination";
export function OverviewView(props: OperationsScreenProps) {
  const { data, query, view, returnTo } = props;
  const {
    member,
    failures,
    failureHasNext,
    queueCounts,
    store,
    commerceSummary,
    units,
    salesTrend: rawSalesTrend,
    readiness,
  } = data;
  const { failurePage } = props.filters;
  const salesTrend = rawSalesTrend;
  const maximumTrendRevenue = Math.max(
    ...salesTrend.map((point) => Math.abs(point.revenueCents)),
    1,
  );
  const hasSalesRevenue = salesTrend.some(
    (point) => point.revenueCents !== 0 || point.orders !== 0,
  );

  return (
    <>
      {view === "overview" && (
        <>
          <section className="commerce-kpis" aria-label="Commerce performance">
            <article>
              <span>Net sales · 30 days</span>
              <strong>
                {money(
                  commerceSummary?.revenueCents ?? 0,
                  store?.currency,
                  store?.precision,
                )}
              </strong>
            </article>
            <article>
              <span>Orders · 30 days</span>
              <strong>{commerceSummary?.orderCount ?? 0}</strong>
            </article>
            <article>
              <span>Average confirmed purchase</span>
              <strong>
                {money(
                  commerceSummary?.averageOrderCents ?? 0,
                  store?.currency,
                  store?.precision,
                )}
              </strong>
            </article>
            <article>
              <span>Confirmed purchase units · 30 days</span>
              <strong>{units}</strong>
            </article>
          </section>
          <section className="panel sales-trend">
            <div>
              <p className="eyebrow">LAST 7 DAYS</p>
              <h2>Net sales trend</h2>
            </div>
            {!hasSalesRevenue && (
              <p className="admin-empty">
                No net sales activity in the last 7 days.
              </p>
            )}
            <div
              className={`trend-bars${hasSalesRevenue ? "" : " trend-bars-empty"}`}
              role="region"
              aria-label="Daily net sales for the last 7 days"
              tabIndex={0}
            >
              {salesTrend.map((point) => {
                const revenue = money(
                  point.revenueCents,
                  store?.currency,
                  store?.precision,
                );
                return (
                  <div className="trend-day" key={point.day}>
                    <span
                      aria-hidden="true"
                      style={{
                        height: `${(Math.abs(point.revenueCents) / maximumTrendRevenue) * 100}%`,
                        backgroundColor:
                          point.revenueCents < 0
                            ? "var(--destructive)"
                            : undefined,
                      }}
                    />
                    <small>{point.day.slice(5)}</small>
                    <b>{revenue}</b>
                    <small>
                      {point.orders} {point.orders === 1 ? "order" : "orders"}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
          <OperationsSummary {...queueCounts} />
        </>
      )}
      {view === "overview" && member.role === "owner" && (
        <section className="panel">
          <h2>Launch checklist</h2>
          <ul>
            {readiness.checklist.map((c) => (
              <li key={c.key}>
                {c.isReady ? "✓" : "○"} {c.label}
              </li>
            ))}
          </ul>
          <p>
            Synthetic demonstration only. Live use requires M2 and M3
            verification.
          </p>
          <form action={togglePause}>
            <Hidden name="returnTo" value={returnTo} />
            <Hidden name="paused" value={String(!store?.isPaused)} />
            <Field
              label="Pause message"
              name="message"
              value={store?.pauseMessage}
            />
            <Button type="submit">
              {store?.isPaused ? "Resume new orders" : "Pause new orders"}
            </Button>
          </form>
        </section>
      )}
      {view === "overview" && (
        <section id="emails">
          <h2>Failed emails</h2>
          <QueuePagination
            query={query}
            path={returnTo}
            parameter="failurePage"
            page={failurePage}
            hasNext={failureHasNext}
          />
          {failures.length === 0 && (
            <p className="admin-empty">
              No failed email deliveries. You&apos;re all caught up.
            </p>
          )}
          {failures.map((f) => (
            <p key={f.id}>
              {f.recipient} · {f.status} · {f.attempts} attempts
            </p>
          ))}
        </section>
      )}
    </>
  );
}
