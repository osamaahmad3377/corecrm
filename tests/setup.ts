import { config } from "dotenv";

// Load .env for integration tests that hit the local database.
config({ path: ".env" });
