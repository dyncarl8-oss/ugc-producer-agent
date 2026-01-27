
import { WhopSDK } from "@whop/sdk";

export const whop = new WhopSDK({
    apiKey: process.env.WHOP_API_KEY,
});
