import apiClient from '@/lib/apiClient';

function normalizeResponse(response) {
  return response?.data ?? response;
}

export async function sendCrossfitRuntimeItem(sessionId, item) {
  const suffix = item.kind === 'substitution' ? 'substitutions' : 'events';
  try {
    const response = await apiClient.post(
      `/crossfit-v2/runtime/sessions/${sessionId}/${suffix}`,
      item.body,
      { cache: false, deduplicate: false, retries: 0, timeout: 10000 }
    );
    return normalizeResponse(response);
  } catch (error) {
    error.code = error?.data?.code ?? error.code;
    error.retryable = error?.data?.retryable ?? (!error.status || error.status >= 500);
    error.safeFallback = error?.data?.safe_fallback ?? null;
    throw error;
  }
}
