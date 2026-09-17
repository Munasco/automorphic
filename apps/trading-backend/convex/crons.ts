import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("renew-owner-tradovate-session", { minutes: 5 }, internal.tradovate.renew, {});
export default crons;
