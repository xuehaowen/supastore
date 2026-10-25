import Link from "next/link";
import { launchGuidance } from "./launch-guidance";

export function LaunchChecklist({
  checklist,
}: {
  checklist: readonly { key: string; label: string; isReady: boolean }[];
}) {
  const next = launchGuidance(checklist);
  const complete =
    checklist.length > 0 && checklist.every((item) => item.isReady);
  return (
    <section
      className="panel launch-checklist"
      aria-labelledby="launch-checklist-heading"
    >
      <h2 id="launch-checklist-heading">Launch checklist</h2>
      {next ? (
        <div className="launch-next-action">
          <p className="eyebrow">Next step</p>
          <h3>
            <Link href={next.href}>{next.label} →</Link>
          </h3>
          <p>{next.description}</p>
        </div>
      ) : complete ? (
        <p>
          Configuration checks complete. Before opening sales, rehearse a
          controlled order, payment, fulfillment and backup restore.
        </p>
      ) : (
        <p>Review the remaining requirements before opening sales.</p>
      )}
      <ul>
        {checklist.map((item) => (
          <li key={item.key}>
            <span>{item.isReady ? "Complete" : "Still needed"}</span>
            {" · "}
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
