/**
 * Autopilot admin pages (server components). Mount in the host app:
 *   app/admin/(protected)/autopilot/page.tsx:         export { AutopilotPage as default } from "@totalweb/blog/autopilot/pages";
 *   app/admin/(protected)/autopilot/voices/page.tsx:  export { AutopilotVoicesPage as default } from "@totalweb/blog/autopilot/pages";
 */
import { AutopilotPanel } from "./components/AutopilotPanel";
import { VoicesPanel } from "./components/VoicesPanel";
import { AUTOPILOT_BASE } from "./env";
import { getAutopilotState, getVoices } from "./queries";

export async function AutopilotPage() {
  const state = await getAutopilotState();
  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Autopilot</h1>
        <p className="mt-1 text-sm text-muted">Fresh blog articles and social posts on a schedule, chosen by the AI and published automatically.</p>
      </div>
      <AutopilotPanel {...state} voicesHref={`${AUTOPILOT_BASE}/voices`} />
    </>
  );
}

export async function AutopilotVoicesPage() {
  const voices = await getVoices();
  return (
    <>
      <div className="mb-4">
        <a href={AUTOPILOT_BASE} className="text-sm text-primary underline">
          ← Autopilot
        </a>
        <h1 className="mt-2 text-2xl font-semibold">Voices</h1>
        <p className="mt-1 text-sm text-muted">
          How the brand writes, and who narrates its videos. The default voice is used for all AI content (autopilot and the AI writers) unless
          another is picked.
        </p>
      </div>
      <VoicesPanel voices={voices} />
    </>
  );
}
