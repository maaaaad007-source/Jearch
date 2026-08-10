import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { setupReport } from "@/lib/config";
import { sourcesFor } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * What this deployment can do, in plain language.
 *
 * This page exists because a misconfiguration used to be invisible: a search
 * would come back empty and there was no way to tell an unconfigured key from a
 * market with no jobs in it. Everything here is names and booleans — no value
 * is ever rendered — so it is safe to leave reachable.
 */
export default function SetupPage() {
  const report = setupReport();
  const countries = ["NL", "SE", "GB", "US", "DE"];

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Setup check</h1>
        <p className="text-sm text-muted-foreground">
          Everything on this page is read from the build that is answering right now. No key or secret is
          shown — only whether one arrived.
        </p>
      </div>

      <Capability
        name="Job search"
        ready={report.jobs.ready}
        detail={report.jobs.detail}
        variables={report.jobs.variables}
      />

      <Capability
        name="Finding who is hiring"
        ready={report.people.ready}
        detail={report.people.detail}
        variables={report.people.variables}
      />

      <Card className="grid gap-3 p-5">
        <h2 className="text-sm font-semibold">Sources by country</h2>
        <ul className="grid gap-2 text-sm">
          {countries.map((code) => (
            <li key={code} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{code}</span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {sourcesFor(code).map((source) => (
                  <Badge key={source.label} variant={source.ready ? "outline" : "destructive"}>
                    {source.label}
                    {source.ready ? "" : " (not connected)"}
                  </Badge>
                ))}
                {sourcesFor(code).length === 0 && (
                  <Badge variant="destructive">No database covers this country</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-sm font-semibold">This build</h2>
        <dl className="grid gap-1.5 text-sm">
          <Row label="Environment" value={report.deployment.environment ?? "unknown"} />
          <Row label="Branch" value={report.deployment.branch ?? "—"} />
          <Row label="Commit" value={report.deployment.commit ?? "—"} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Environment variables are scoped per environment. A variable saved for Production does not reach
          a Preview build, and no variable reaches a build that was created before it was saved — redeploy
          after changing one.
        </p>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-sm font-semibold">Variable names detected</h2>
        {report.variablesDetected.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {report.variablesDetected.map((name) => (
              <li key={name}>
                <Badge variant="outline" className="font-mono text-xs">
                  {name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            None. If you have added some, they were saved to a different project or environment, or the
            deployment predates them.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Names only, never values. Spelling is matched loosely — case and separators do not matter — so a
          name missing from this list did not reach this build at all.
        </p>
      </Card>
    </div>
  );
}

function Capability({
  name,
  ready,
  detail,
  variables,
}: {
  name: string;
  ready: boolean;
  detail: string;
  variables: string[];
}) {
  return (
    <Card className="grid gap-2 p-5">
      <div className="flex items-center gap-2">
        {ready ? (
          <CheckCircle2 className="size-4 text-[var(--success)]" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        <h2 className="text-sm font-semibold">{name}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <p className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <Badge key={variable} variant="outline" className="font-mono text-xs">
            {variable}
          </Badge>
        ))}
      </p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}
