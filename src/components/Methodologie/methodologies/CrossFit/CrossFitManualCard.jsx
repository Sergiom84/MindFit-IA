import { useEffect, useState } from "react";

import tokenManager from "../../../../utils/tokenManager";
import CrossFitAssessmentCard from "./CrossFitAssessmentCard.jsx";
import CrossFitManualCardLegacy from "./CrossFitManualCardLegacy.jsx";

const CAPABILITIES_ENDPOINT = "/api/routine-generation/specialist/crossfit/capabilities";

export default function CrossFitManualCard(props) {
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const token = tokenManager.getToken();
    if (!token) {
      setCapabilities({ enabled: false });
      return () => controller.abort();
    }

    fetch(CAPABILITIES_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error(`capabilities_${response.status}`);
        return response.json();
      })
      .then((payload) => setCapabilities(payload))
      .catch((error) => {
        if (error.name !== "AbortError") setCapabilities({ enabled: false });
      });

    return () => controller.abort();
  }, []);

  if (!capabilities) {
    return (
      <div className="min-h-[28rem] bg-black p-6 text-white" data-testid="crossfit-capabilities-loading">
        <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-white/10 bg-zinc-950 p-8">
          <div className="mb-4 h-4 w-36 rounded bg-zinc-800" />
          <div className="mb-8 h-10 w-2/3 rounded bg-zinc-800" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-24 rounded-xl bg-zinc-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!capabilities.enabled) return <CrossFitManualCardLegacy {...props} />;
  return <CrossFitAssessmentCard {...props} capabilities={capabilities} />;
}
