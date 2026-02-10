import { NextRequest, NextResponse } from "next/server"

const DYNAMICS_API_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"

export async function GET(req: NextRequest) {
  // The client sends the Bearer token via a custom header to avoid CORS preflight issues
  const token = req.headers.get("x-dynamics-token")

  if (!token) {
    return NextResponse.json(
      { error: { message: "Missing X-Dynamics-Token header. Sign in with Microsoft first." } },
      { status: 401 }
    )
  }

  try {
    const res = await fetch(DYNAMICS_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    })

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
        error: {
          message: `Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          type: err instanceof Error ? err.constructor.name : typeof err,
        },
      },
      { status: 502 }
    )
  }
}
