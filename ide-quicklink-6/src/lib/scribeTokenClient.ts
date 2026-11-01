export interface ScribeTokenResponse {
  token: string;
  expires_in_seconds: number;
}

export async function requestScribeToken(
  options: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const environment = (import.meta as unknown as { env?: { VITE_ECHO_API_BASE_URL?: string } }).env;
  const baseUrl = (options.baseUrl ?? environment?.VITE_ECHO_API_BASE_URL)?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Live transcription is not configured. Set VITE_ECHO_API_BASE_URL.');

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/transcription/scribe-token`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the live transcription service. Check the API URL and connection.');
  }

  if (!response.ok) {
    let message = 'Live transcription is temporarily unavailable.';
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === 'object' && detail !== null && 'message' in detail) {
          const candidate = (detail as { message?: unknown }).message;
          if (typeof candidate === 'string') message = candidate;
        }
      }
    } catch {
      // Keep a safe generic message for non-JSON provider or proxy errors.
    }
    throw new Error(message);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== 'object' || result === null ||
    !('token' in result) || typeof (result as { token: unknown }).token !== 'string' ||
    !(result as { token: string }).token.trim()
  ) {
    throw new Error('The transcription service returned an invalid session token.');
  }
  return (result as ScribeTokenResponse).token;
}
