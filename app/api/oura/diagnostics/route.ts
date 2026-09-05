import { requestUserErrorResponse, requireRequestUser } from "@/platform/auth/server";
import { loadRefreshDiagnostics } from "@/features/oura-connection/server";
import { abortable, withDeadline } from "@/shared/abortable";

export async function GET(request: Request) {
  let user;
  try {
    user = requireRequestUser(request);
  } catch (error) {
    const response = requestUserErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const report = await withDeadline((signal) => abortable(loadRefreshDiagnostics(user.userId), signal), 10_000);
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "diagnostics_unavailable" }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
