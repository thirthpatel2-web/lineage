// Scripts read the same .env.local / .env files that Next.js does.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
