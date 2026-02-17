import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import lookupRoutes from "./routes/lookup.js";
import "dotenv/config";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // Content scripts run in the web page's origin (e.g. https://www.zillow.com),
      // not chrome-extension://, so we must allow the page origin.
      // In production, lock this down to specific domains or move
      // fetch calls to the service worker (which bypasses CORS).
      if (!origin) return "*";
      return origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Routes
app.route("/", lookupRoutes);

// Start server
const port = parseInt(process.env.PORT || "3001", 10);
console.log(`BroadbandView API starting on port ${port}`);
serve({ fetch: app.fetch, port });
