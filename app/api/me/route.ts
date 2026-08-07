import { getChatGPTUser } from "../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  return Response.json(
    { user },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
