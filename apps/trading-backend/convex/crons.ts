import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
// Tradovate tokens last about an hour, so check well inside that lifetime.
crons.interval("renew-owner-tradovate-session", { minutes: 15 }, internal.tradovate.renew, {});
export default crons;
