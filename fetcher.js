export async function fetchScholarReport(query, limit = 10) {
  const response = await fetch(`/api/publications?query=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Scholar Pulse request failed: ${response.status}`);
  }

  return payload;
}
