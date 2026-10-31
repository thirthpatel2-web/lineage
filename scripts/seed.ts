// Seeds the demo data.  npm run seed
import "./load-env";
import { seedDemo } from "@/lib/seed";

seedDemo(console.log)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
