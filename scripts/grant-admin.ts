/**
 * Grants or revokes the admin role.
 *
 * This is deliberately the ONLY way to create an administrator. There is no
 * HTTP endpoint that can grant admin, so an attacker who compromises a normal
 * account still cannot escalate — they would need shell access to the machine
 * running the database.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const revoke = args.includes("--revoke");

  if (!email) {
    console.error("Usage: npm run admin:grant -- <email> [--revoke]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, role: true },
  });

  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
    return;
  }

  if (revoke) {
    const others = await prisma.user.count({
      where: { role: "admin", suspended: false, id: { not: user.id } },
    });
    if (user.role === "admin" && others === 0) {
      console.error("Refusing to revoke the last administrator — you would lock yourself out.");
      process.exitCode = 1;
      return;
    }
  }

  const role = revoke ? "user" : "admin";
  if (user.role === role) {
    console.log(`${user.email} is already ${role === "admin" ? "an admin" : "a regular user"}.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(`${user.email} (@${user.username}) is now ${role === "admin" ? "an ADMIN" : "a regular user"}.`);
  console.log("Sign out and back in for the change to show in the navigation.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
