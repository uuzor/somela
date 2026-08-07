import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function getPrismaDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  // Prisma relies on prepared statements. Use Supabase's session pooler for
  // Prisma instead of the transaction pooler on port 6543.
  try {
    const url = new URL(databaseUrl);
    if (url.hostname.includes("pooler.supabase.com") && url.port === "6543") {
      url.port = "5432";
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const prismaOptions = {
  datasources: {
    db: { url: getPrismaDatabaseUrl() },
  },
};

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient(prismaOptions);
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient(prismaOptions);

export default prisma;
