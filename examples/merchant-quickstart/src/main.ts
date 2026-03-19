import { loadConfig } from "./config";
import { startServer } from "./server";

void startServer(loadConfig()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
