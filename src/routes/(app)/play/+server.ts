import type { RequestHandler } from "@sveltejs/kit";
import type { PlayRequestBody } from "./play.types";

export const POST: RequestHandler = async ({ url, request }) => {
    const body = await request.json() as PlayRequestBody;
    
    return new Response();
}
