import { runDiscoveryTurn } from "./discovery-turn.js";
 
async function main() {
  const result = await runDiscoveryTurn("user_123", "show me yoga clothes in blue");
  console.log("chatReply:", result.chatReply);
  console.log("uiPayload:", JSON.stringify(result.uiPayload, null, 2));
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
 