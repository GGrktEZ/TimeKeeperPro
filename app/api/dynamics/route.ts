import { NextRequest, NextResponse } from "next/server"

const DYNAMICS_API_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"

export async function GET(req: NextRequest) {
  // Forward cookies from the browser so Dynamics auth works
  const cookie = req.headers.get("cookie") ?? ""
  const authHeader = req.headers.get("authorization") ?? ""

  const headers: Record<string, string> = {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  }

  if (cookie) headers["Cookie"] = cookie
  if (authHeader) headers["Authorization"] = authHeader

  try {
    const res = await fetch(DYNAMICS_API_URL, { headers })
    const body = await res.text()

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        proxyError: true,
        message: err instanceof Error ? err.message : String(err),
        type: err instanceof Error ? err.constructor.name : typeof err,
      },
      { status: 502 }
    )
  }
}
