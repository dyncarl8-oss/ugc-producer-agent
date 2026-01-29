import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateAdCampaign } from "./function";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        generateAdCampaign,
    ],
});
