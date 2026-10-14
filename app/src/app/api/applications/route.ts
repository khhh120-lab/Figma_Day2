import {saveApplication} from "../../../server/applications";
export const runtime="nodejs";
export async function POST(request:Request) {return saveApplication(request);}
