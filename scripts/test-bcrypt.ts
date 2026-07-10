import { compare } from 'bcryptjs';
async function main() {
  const hash = "$2b$12$0PbZJGZcxML2IRWE2/Rpr.fC9kMqnDLY2T4CibL.z81DQMgKmuWPK";
  const match = await compare('password123', hash);
  console.log("Match:", match);
}
main().catch(console.error);
