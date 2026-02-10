// Receives Dynamics project data from the bookmarklet.
// Stores it in a global in-memory variable that the poll endpoint reads.
// This is intentionally ephemeral -- data lives only until consumed or until the server restarts.

let pendingData: { ts: number; body: unknown } | null = null

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body?.value || !Array.isArray(body.value)) {
      return Response.json(
        { error: "Invalid payload: expected { value: [...] }" },
        { status: 400 }
      )
    }
    pendingData = { ts: Date.now(), body }
    return Response.json({ ok: true, count: body.value.length })
  } catch (err) {
    return Response.json(
      { error: `Failed to parse body: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    )
  }
}

export async function GET() {
  // Poll endpoint: return pending data if available and less than 2 minutes old
  if (pendingData && Date.now() - pendingData.ts < 120_000) {
    const data = pendingData
    pendingData = null // consume it
    return Response.json({ available: true, data: data.body })
  }
  return Response.json({ available: false })
}
